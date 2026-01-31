-- Drop sync_operations table
-- This table was created for conflict resolution auditing but was never used by the application.

-- Remove from realtime publication (if added)
alter publication supabase_realtime drop table if exists sync_operations;

-- Drop trigger
drop trigger if exists set_sync_operations_user_id on sync_operations;

-- Drop policies
drop policy if exists "Users can view their own sync operations" on sync_operations;
drop policy if exists "Users can create their own sync operations" on sync_operations;
drop policy if exists "Users can delete their own sync operations" on sync_operations;

-- Drop table (cascades indexes)
drop table if exists sync_operations;
