-- 0013: the universe is a backdrop. Nothing in the database feeds it any more: the galaxy
-- is generated in the browser from a fixed seed, and its events come from the owner's own
-- actions in the app. Idempotent like every migration.
--
-- 0011 already removed the stardust ledger (sp_universe_events), the eras and the scoring
-- triggers. What it kept, the snapshot of stars, planets and constellations, goes here.

-- ── the snapshot ───────────────────────────────────────────────────────────
drop function if exists public.sp_universe_snapshot();

-- ── scoring, for a database that somehow still has it ──────────────────────
-- Repeated from 0011 so that this file alone leaves no progression writes behind.
drop trigger if exists sp_tasks_score on public.sp_tasks;
drop trigger if exists sp_goals_score on public.sp_goals;
drop trigger if exists sp_routine_logs_score on public.sp_routine_logs;
drop trigger if exists sp_focus_sessions_score on public.sp_focus_sessions;
drop function if exists public.sp_tasks_score();
drop function if exists public.sp_goals_score();
drop function if exists public.sp_routine_logs_score();
drop function if exists public.sp_focus_sessions_score();
drop function if exists public.sp__award(uuid, text, uuid, date, int);
