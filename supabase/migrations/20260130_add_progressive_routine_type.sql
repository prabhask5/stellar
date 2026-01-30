-- Add progressive routine type and supporting columns

-- Add new columns for progressive routines
alter table daily_routine_goals add column if not exists start_target_value integer;
alter table daily_routine_goals add column if not exists end_target_value integer;
alter table daily_routine_goals add column if not exists progression_schedule integer;

-- Drop and recreate the type CHECK constraint to include 'progressive'
alter table daily_routine_goals drop constraint if exists daily_routine_goals_type_check;
alter table daily_routine_goals add constraint daily_routine_goals_type_check
  check (type in ('completion', 'incremental', 'progressive'));
