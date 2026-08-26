-- Undo 0011_advice.sql.
--
-- YOU ALMOST CERTAINLY DO NOT NEED THIS.
--
-- The advisory columns are additive and inert: nothing reads them except the
-- Care advice card, nothing writes them except the ML service, and no gate,
-- score, verdict or payment consults them. Leaving them in place costs nothing
-- even if the feature is abandoned, and dropping them destroys every advice row
-- already generated.
--
-- The one case where this is the right tool: the frontend has been rolled back
-- to a build that predates `leaf_photo`, AND you want the schema to match it
-- exactly. Even then, consider leaving the columns - an older client simply does
-- not send `leaf_photo`, and a nullable column it never writes is harmless.
--
-- THIS DOES NOT UNDO THE DUPLICATE MERGE. That is data, not schema, and it has
-- its own tested path:
--
--     python tools/restore_merge.py backups/<date>-merge-backup.json --apply

-- ---------------------------------------------------------------------------
-- 1. Restore the review queue to its pre-0011 column list
-- ---------------------------------------------------------------------------
-- Must happen BEFORE the columns are dropped: the view selects `c.*`, so
-- Postgres refuses to drop a column the view depends on.
drop view if exists review_queue;

-- ---------------------------------------------------------------------------
-- 2. Drop the advisory columns
-- ---------------------------------------------------------------------------
-- DESTRUCTIVE. Every generated species guess and every piece of care advice goes
-- with them. Back them up first if there is any chance you want them:
--
--   create table advice_backup as
--     select id, leaf_photo, species_guess, advice from checkins
--      where advice is not null;
alter table checkins
  drop column if exists leaf_photo,
  drop column if exists species_guess,
  drop column if exists advice;

-- ---------------------------------------------------------------------------
-- 3. Recreate the view exactly as 0006 defined it
-- ---------------------------------------------------------------------------
create view review_queue as
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

-- Same reasoning as 0011: a recreated view is a newly created object and can
-- re-inherit anon's default grant. This view joins every check-in to its tree,
-- so an anon SELECT would expose the whole pilot dataset including GPS.
revoke all on review_queue from anon;
