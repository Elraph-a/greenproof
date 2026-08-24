-- GreenProof - human review of uncertain check-ins
--
-- THE PROBLEM THIS SOLVES
-- Column grants deliberately prevent ANY client from writing checkins.verdict.
-- That is the rule that stops a planter approving their own check-in. But
-- "designed to degrade, not break" requires that a low-confidence visit routes
-- to a person - and that person is also a client.
--
-- The answer is a SECURITY DEFINER function: a single, narrow, audited doorway
-- that runs with the owner's privileges, checks the caller is a reviewer, and
-- writes only the three columns a review is allowed to touch. The grant model
-- stays intact; we have not opened the column, we have opened one function.

create or replace function public.review_checkin(
  p_checkin_id uuid,
  p_verdict    checkin_verdict,
  p_note       text default null
)
returns checkins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
  v_row  checkins;
begin
  -- A reviewer, and nobody else.
  select role into v_role from profiles where id = auth.uid();
  if v_role is distinct from 'reviewer' then
    raise exception 'Only reviewers may decide a check-in'
      using errcode = '42501';
  end if;

  -- A review is a HUMAN judgement between two states. It cannot invent a
  -- 'pending', and it cannot be used to bulk-approve by passing anything else.
  if p_verdict not in ('verified', 'flagged') then
    raise exception 'A review must be either verified or flagged'
      using errcode = '22023';
  end if;

  update checkins
     set verdict     = p_verdict,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         -- Keep the machine's original assessment. Overwriting it would destroy
         -- the only evidence of how often the model and the human disagree -
         -- which is precisely the number that lets us publish a false-accept
         -- rate rather than assert one.
         signals     = coalesce(signals, '{}'::jsonb) || jsonb_build_object(
                         'review', jsonb_build_object(
                           'by',       auth.uid(),
                           'at',       now(),
                           'note',     p_note,
                           'verdict',  p_verdict,
                           'machine_verdict',    signals -> 'machine_verdict',
                           'machine_confidence', confidence
                         ))
   where id = p_checkin_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'No such check-in';
  end if;

  update trees
     set status = case when p_verdict = 'verified' then 'alive'::tree_status
                       else 'flagged'::tree_status end
   where id = v_row.tree_id;

  return v_row;
end;
$$;

revoke all on function public.review_checkin(uuid, checkin_verdict, text) from public, anon;
grant execute on function public.review_checkin(uuid, checkin_verdict, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The queue itself
-- ---------------------------------------------------------------------------
-- Two kinds of row belong here:
--   * verdict = 'review'  - the model was not confident enough
--   * audit_sample = true - a RANDOM sample of AUTO-APPROVED check-ins.
--
-- The second is the unusual one and it is the point. Reviewing only the
-- uncertain cases tells you nothing about how often you were confidently WRONG.
-- Sampling auto-approvals is the only way to estimate the false-accept rate,
-- and the false-accept rate is the number that matters: a wrongly rejected
-- genuine visit is annoying, a wrongly approved fraud is fatal.

create or replace view review_queue as
  select c.*,
         t.tag_code,
         t.species,
         t.lat  as tree_lat,
         t.lng  as tree_lng,
         (c.audit_sample and c.verdict = 'verified') as is_audit
    from checkins c
    join trees t on t.id = c.tree_id
   where c.reviewed_at is null
     and (c.verdict = 'review' or (c.audit_sample and c.verdict = 'verified'))
   order by c.audit_sample desc, c.confidence asc nulls first;

grant select on review_queue to authenticated;
