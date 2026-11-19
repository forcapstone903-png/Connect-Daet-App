BEGIN;

CREATE TABLE IF NOT EXISTS public.moderation_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.info_moderation(id) ON DELETE SET NULL,
  affected_user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  reviewer_role TEXT,
  decision_type TEXT NOT NULL,
  violation_category TEXT,
  reason TEXT NOT NULL,
  reviewer_remarks TEXT,
  previous_status TEXT,
  new_status TEXT,
  suspension_duration_days INTEGER,
  effective_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  original_decision_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS moderation_decisions_user_created_idx
  ON public.moderation_decisions (affected_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_decisions_case_idx
  ON public.moderation_decisions (case_id, created_at DESC);

CREATE SEQUENCE IF NOT EXISTS public.moderation_receipt_number_seq;

CREATE TABLE IF NOT EXISTS public.moderation_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE,
  case_id UUID REFERENCES public.info_moderation(id) ON DELETE SET NULL,
  affected_user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  decision_id UUID NOT NULL REFERENCES public.moderation_decisions(id) ON DELETE RESTRICT,
  reviewer_id UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  original_receipt_id UUID REFERENCES public.moderation_receipts(id) ON DELETE RESTRICT,
  audience TEXT NOT NULL CHECK (audience IN ('staff', 'user')),
  document_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS moderation_receipts_decision_audience_idx
  ON public.moderation_receipts (decision_id, audience);
CREATE INDEX IF NOT EXISTS moderation_receipts_user_created_idx
  ON public.moderation_receipts (affected_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_receipts_case_idx
  ON public.moderation_receipts (case_id, created_at DESC);

ALTER TABLE public.admin_user_bans
  ADD COLUMN IF NOT EXISTS ban_type TEXT NOT NULL DEFAULT 'posting',
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
  ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_user_bans_ban_type_check'
      AND conrelid = 'public.admin_user_bans'::regclass
  ) THEN
    ALTER TABLE public.admin_user_bans
      ADD CONSTRAINT admin_user_bans_ban_type_check
      CHECK (ban_type IN ('posting', 'suspension', 'permanent'));
  END IF;
END;
$$;

ALTER TABLE public.moderation_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.moderation_decisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.moderation_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.moderation_decisions TO service_role;
GRANT ALL ON TABLE public.moderation_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.generate_moderation_receipt_number()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT 'DC-MOD-' || EXTRACT(YEAR FROM NOW())::INTEGER || '-' ||
         lpad(nextval('public.moderation_receipt_number_seq')::TEXT, 6, '0');
$$;

REVOKE ALL ON FUNCTION public.generate_moderation_receipt_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_moderation_receipt_number() TO service_role;

CREATE OR REPLACE FUNCTION public.create_moderation_decision_receipts(
  p_case_id UUID,
  p_affected_user_id UUID,
  p_reviewer_id UUID,
  p_reviewer_role TEXT,
  p_decision_type TEXT,
  p_violation_category TEXT,
  p_reason TEXT,
  p_reviewer_remarks TEXT,
  p_previous_status TEXT,
  p_new_status TEXT,
  p_suspension_duration_days INTEGER DEFAULT NULL,
  p_effective_at TIMESTAMPTZ DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_original_receipt_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision_id UUID;
  v_original_receipt_id UUID;
  v_staff_receipt_id UUID;
  v_user_receipt_id UUID;
  v_receipt_number TEXT;
  v_user_row public.info_users%ROWTYPE;
  v_case_row public.info_moderation%ROWTYPE;
  v_reviewer_row public.info_users%ROWTYPE;
  v_staff_payload JSONB;
  v_user_payload JSONB;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A decision reason is required';
  END IF;
  IF p_decision_type NOT IN (
    'WARNING_ISSUED','REPORT_REJECTED','SUSPENSION_APPROVED','PERMANENT_BAN_APPROVED',
    'SUSPENSION_LIFTED','PERMANENT_BAN_REVERSED','ACCOUNT_RESTORED','APPEAL_DECISION',
    'SUSPENSION_EXPIRED','AUTOMATIC_RESTORATION'
  ) THEN
    RAISE EXCEPTION 'Unsupported moderation decision type';
  END IF;

  SELECT * INTO v_user_row FROM public.info_users WHERE id = p_affected_user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Affected account no longer exists'; END IF;
  IF p_reviewer_id IS NOT NULL THEN
    SELECT * INTO v_reviewer_row FROM public.info_users WHERE id = p_reviewer_id FOR SHARE;
  END IF;
  IF p_case_id IS NOT NULL THEN
    SELECT * INTO v_case_row FROM public.info_moderation WHERE id = p_case_id FOR SHARE;
  END IF;

  IF p_original_receipt_id IS NOT NULL THEN
    SELECT id INTO v_original_receipt_id
      FROM public.moderation_receipts
     WHERE id = p_original_receipt_id;
  END IF;

  INSERT INTO public.moderation_decisions (
    case_id, affected_user_id, reviewer_id, reviewer_role, decision_type,
    violation_category, reason, reviewer_remarks, previous_status, new_status,
    suspension_duration_days, effective_at, expires_at, original_decision_id
  ) VALUES (
    p_case_id, p_affected_user_id, p_reviewer_id, p_reviewer_role, p_decision_type,
    p_violation_category, BTRIM(p_reason), NULLIF(BTRIM(COALESCE(p_reviewer_remarks,'')), ''),
    p_previous_status, p_new_status, p_suspension_duration_days,
    p_effective_at, p_expires_at,
    (SELECT original_decision_id FROM public.moderation_decisions
      WHERE id = (SELECT decision_id FROM public.moderation_receipts WHERE id = p_original_receipt_id)
      LIMIT 1)
  )
  RETURNING id INTO v_decision_id;

  v_staff_payload := jsonb_build_object(
    'receiptAudience','staff',
    'caseReference',COALESCE(v_case_row.id::TEXT,p_case_id::TEXT),
    'user',jsonb_build_object(
      'id',v_user_row.id,'username',v_user_row.username,'fullName',v_user_row.full_name,
      'email',v_user_row.email,'previousStatus',p_previous_status,'newStatus',p_new_status
    ),
    'review',jsonb_build_object(
      'reviewerId',p_reviewer_id,'reviewerName',v_reviewer_row.full_name,
      'reviewerRole',p_reviewer_role,'remarks',p_reviewer_remarks,'reason',p_reason,
      'violationCategory',p_violation_category,'decisionType',p_decision_type
    ),
    'suspension',jsonb_build_object(
      'durationDays',p_suspension_duration_days,'effectiveAt',p_effective_at,'expiresAt',p_expires_at
    ),
    'case',to_jsonb(v_case_row),
    'generatedAt',v_now,
    'payload',p_payload,
    'originalReceiptId',p_original_receipt_id
  );

  v_user_payload := jsonb_build_object(
    'receiptAudience','user',
    'caseReference',COALESCE(v_case_row.id::TEXT,p_case_id::TEXT),
    'accountUsername',v_user_row.username,
    'accountStatus',p_new_status,
    'violationCategory',p_violation_category,
    'decisionType',p_decision_type,
    'reason',p_reason,
    'effectiveAt',p_effective_at,
    'expiresAt',p_expires_at,
    'reviewerDesignation',p_reviewer_role,
    'generatedAt',v_now,
    'originalReceiptId',p_original_receipt_id
  );

  v_receipt_number := public.generate_moderation_receipt_number();
  INSERT INTO public.moderation_receipts (
    receipt_number,case_id,affected_user_id,decision_id,reviewer_id,
    original_receipt_id,audience,document_type,payload
  ) VALUES (
    v_receipt_number,p_case_id,p_affected_user_id,v_decision_id,p_reviewer_id,
    v_original_receipt_id,'staff',p_decision_type,v_staff_payload
  ) RETURNING id INTO v_staff_receipt_id;

  v_receipt_number := public.generate_moderation_receipt_number();
  INSERT INTO public.moderation_receipts (
    receipt_number,case_id,affected_user_id,decision_id,reviewer_id,
    original_receipt_id,audience,document_type,payload
  ) VALUES (
    v_receipt_number,p_case_id,p_affected_user_id,v_decision_id,p_reviewer_id,
    v_original_receipt_id,'user',p_decision_type,v_user_payload
  ) RETURNING id INTO v_user_receipt_id;

  INSERT INTO public.info_audit_log (
    user_id,action,table_name,record_id,changes,created_at
  ) VALUES (
    p_reviewer_id,'receipt-generated','moderation_receipts',v_user_receipt_id,
    jsonb_build_object(
      'decisionId',v_decision_id,'affectedUserId',p_affected_user_id,
      'caseId',p_case_id,'staffReceiptId',v_staff_receipt_id,'userReceiptId',v_user_receipt_id
    ),v_now
  );

  RETURN jsonb_build_object(
    'decision_id',v_decision_id,'staff_receipt_id',v_staff_receipt_id,
    'user_receipt_id',v_user_receipt_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_moderation_decision_receipts(UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TIMESTAMPTZ,TIMESTAMPTZ,UUID,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_moderation_decision_receipts(UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TIMESTAMPTZ,TIMESTAMPTZ,UUID,JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.process_expired_moderation_suspensions(p_limit INTEGER DEFAULT 100)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.admin_user_bans%ROWTYPE;
  v_count INTEGER := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;

  FOR v_row IN
    SELECT * FROM public.admin_user_bans
     WHERE ban_type = 'suspension'
       AND lifted_at IS NULL
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()
     ORDER BY expires_at ASC
     FOR UPDATE
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit,100),500))
  LOOP
    UPDATE public.admin_user_bans
       SET lifted_at = NOW(),
           lift_reason = 'Automatically lifted after suspension expiration'
     WHERE id = v_row.id
       AND lifted_at IS NULL;

    IF EXISTS (
      SELECT 1 FROM public.admin_user_bans
       WHERE user_id = v_row.user_id
         AND lifted_at IS NULL
         AND ban_type IN ('suspension','permanent')
    ) THEN
      CONTINUE;
    END IF;

    UPDATE public.info_users
       SET status = 'active', updated_at = NOW()
     WHERE id = v_row.user_id
       AND status = 'suspended'
       AND account_deactivated_at IS NULL;

    INSERT INTO public.info_notifications (
      user_id,title,message,type,is_read,link,created_at,updated_at
    ) VALUES (
      v_row.user_id,'Account suspension expired',
      'Your suspension has expired and your account has been restored to Active.',
      'success',FALSE,'/info/user/notifications',NOW(),NOW()
    );

    INSERT INTO public.info_audit_log (
      user_id,action,table_name,record_id,changes,created_at
    ) VALUES (
      NULL,'automatic-suspension-restoration','admin_user_bans',v_row.id,
      jsonb_build_object('userId',v_row.user_id,'previousStatus','suspended','newStatus','active',
                         'expiresAt',v_row.expires_at,'reason','Suspension duration elapsed'),NOW()
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('restored',v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.process_expired_moderation_suspensions(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_expired_moderation_suspensions(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.approve_permanent_account_ban(
  p_case_id UUID,
  p_user_id UUID,
  p_reviewer_id UUID,
  p_reason TEXT,
  p_violation_category TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target public.info_users%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_receipts JSONB;
  v_reviewer_role TEXT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN
    RAISE EXCEPTION 'A permanent ban reason is required';
  END IF;

  SELECT * INTO v_target FROM public.info_users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The account no longer exists'; END IF;
  IF lower(COALESCE(v_target.user_type,'')) IN ('admin','administrator','moderator','tourism_officer') THEN
    RAISE EXCEPTION 'Staff accounts cannot be permanently banned';
  END IF;
  IF v_target.status = 'banned' THEN RAISE EXCEPTION 'This account is already permanently banned'; END IF;
  IF p_reviewer_id IS NULL OR NOT public.is_staff_in(p_reviewer_id, ARRAY['admin','administrator']) THEN
    RAISE EXCEPTION 'Only an Administrator can approve a permanent ban';
  END IF;

  SELECT lower(user_type) INTO v_reviewer_role
    FROM public.info_users WHERE id = p_reviewer_id;

  INSERT INTO public.admin_user_bans (
    user_id,reason,banned_by,banned_at,expires_at,lifted_by,lifted_at,ban_type
  ) VALUES (
    p_user_id,BTRIM(p_reason),p_reviewer_id,v_now,NULL,NULL,NULL,'permanent'
  )
  ON CONFLICT (user_id) DO UPDATE
    SET reason=EXCLUDED.reason,banned_by=EXCLUDED.banned_by,banned_at=EXCLUDED.banned_at,
        expires_at=NULL,lifted_by=NULL,lifted_at=NULL,ban_type='permanent';

  UPDATE public.info_users
     SET status='banned',updated_at=v_now
   WHERE id=p_user_id;

  UPDATE public.info_moderation
     SET status='resolved',resolution='Permanent ban approved: ' || BTRIM(p_reason),
         moderation_notes=BTRIM(p_reason),assigned_to=p_reviewer_id,resolved_at=v_now,updated_at=v_now
   WHERE id=p_case_id;

  INSERT INTO public.info_notifications (
    user_id,title,message,type,is_read,link,actor_id,created_at,updated_at
  ) VALUES (
    p_user_id,'Account permanently banned',
    'Your Daet Connect account has been permanently banned following an administrative review. Reason: ' || BTRIM(p_reason),
    'warning',FALSE,'/info/user/moderation-appeals',p_reviewer_id,v_now,v_now
  );

  INSERT INTO public.info_audit_log (
    user_id,action,table_name,record_id,changes,created_at
  ) VALUES (
    p_reviewer_id,'approve-permanent-ban','admin_user_bans',p_user_id,
    jsonb_build_object('caseId',p_case_id,'reason',BTRIM(p_reason),'violationCategory',p_violation_category,
                       'previousStatus',v_target.status,'newStatus','banned','decisionTimestamp',v_now),v_now
  );

  v_receipts := public.create_moderation_decision_receipts(
    p_case_id,p_user_id,p_reviewer_id,v_reviewer_role,'PERMANENT_BAN_APPROVED',
    p_violation_category,BTRIM(p_reason),'Permanent ban approved by Administrator',
    v_target.status,'banned',NULL,v_now,NULL,NULL,
    jsonb_build_object('permanentBanReason',BTRIM(p_reason),'enforcementDate',v_now)
  );

  RETURN v_receipts || jsonb_build_object('user_id',p_user_id,'new_status','banned');
END;
$$;

REVOKE ALL ON FUNCTION public.approve_permanent_account_ban(UUID,UUID,UUID,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_permanent_account_ban(UUID,UUID,UUID,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.reverse_permanent_account_ban(
  p_user_id UUID,
  p_reviewer_id UUID,
  p_reason TEXT,
  p_case_id UUID DEFAULT NULL,
  p_original_receipt_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target public.info_users%ROWTYPE;
  v_ban public.admin_user_bans%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_role TEXT;
  v_receipts JSONB;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted server access is required';
  END IF;
  IF NULLIF(BTRIM(p_reason),'') IS NULL THEN RAISE EXCEPTION 'A reversal reason is required'; END IF;
  IF p_reviewer_id IS NULL OR NOT public.is_staff_in(p_reviewer_id, ARRAY['admin','administrator']) THEN
    RAISE EXCEPTION 'Only an Administrator can reverse a permanent ban';
  END IF;

  SELECT * INTO v_target FROM public.info_users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_target.status <> 'banned' THEN RAISE EXCEPTION 'This account is not permanently banned'; END IF;
  SELECT * INTO v_ban FROM public.admin_user_bans
   WHERE user_id=p_user_id AND ban_type='permanent' AND lifted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active permanent ban was found'; END IF;

  SELECT lower(user_type) INTO v_role FROM public.info_users WHERE id=p_reviewer_id;

  UPDATE public.admin_user_bans
     SET lifted_by=p_reviewer_id,lifted_at=v_now,reversed_by=p_reviewer_id,reversed_at=v_now,
         reversal_reason=BTRIM(p_reason)
   WHERE id=v_ban.id;

  UPDATE public.info_users SET status='active',updated_at=v_now
   WHERE id=p_user_id;

  INSERT INTO public.info_notifications (
    user_id,title,message,type,is_read,link,actor_id,created_at,updated_at
  ) VALUES (
    p_user_id,'Account ban reversed',
    'Your Daet Connect account ban has been reversed following an administrative review. Reason: ' || BTRIM(p_reason),
    'success',FALSE,'/info/user/moderation-appeals',p_reviewer_id,v_now,v_now
  );

  INSERT INTO public.info_audit_log (
    user_id,action,table_name,record_id,changes,created_at
  ) VALUES (
    p_reviewer_id,'reverse-permanent-ban','admin_user_bans',v_ban.id,
    jsonb_build_object('userId',p_user_id,'caseId',p_case_id,'reason',BTRIM(p_reason),
                       'previousStatus','banned','newStatus','active','reversedAt',v_now),v_now
  );

  v_receipts := public.create_moderation_decision_receipts(
    p_case_id,p_user_id,p_reviewer_id,v_role,'PERMANENT_BAN_REVERSED',
    NULL,BTRIM(p_reason),'Permanent ban reversed by Administrator',
    'banned','active',NULL,v_now,NULL,p_original_receipt_id,
    jsonb_build_object('banId',v_ban.id,'reversalReason',BTRIM(p_reason),'reversedAt',v_now)
  );

  RETURN v_receipts || jsonb_build_object('user_id',p_user_id,'new_status','active');
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_permanent_account_ban(UUID,UUID,TEXT,UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_permanent_account_ban(UUID,UUID,TEXT,UUID,UUID) TO service_role;

COMMIT;
