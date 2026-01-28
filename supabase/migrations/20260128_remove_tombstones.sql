-- Remove tombstones table
-- Reason: Soft-delete (deleted=true field) + conflict resolution's delete_wins strategy
-- already handles multi-device deletion correctly. Separate tombstone table is redundant.

-- Drop trigger first
drop trigger if exists set_tombstones_user_id on tombstones;

-- Drop policies
drop policy if exists "Users can view their own tombstones" on tombstones;
drop policy if exists "Users can create their own tombstones" on tombstones;
drop policy if exists "Users can delete their own tombstones" on tombstones;

-- Drop indexes
drop index if exists idx_tombstones_user_id;
drop index if exists idx_tombstones_entity;
drop index if exists idx_tombstones_deleted_at;

-- Drop table
drop table if exists tombstones;
