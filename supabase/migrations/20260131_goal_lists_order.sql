-- Add order column to goal_lists for drag-and-drop reordering
ALTER TABLE goal_lists ADD COLUMN "order" double precision DEFAULT 0 NOT NULL;

-- Backfill: assign order based on created_at (newest first = lowest order)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) - 1 AS rn
  FROM goal_lists
)
UPDATE goal_lists SET "order" = ranked.rn FROM ranked WHERE goal_lists.id = ranked.id;

-- Index for efficient ordering queries
CREATE INDEX idx_goal_lists_order ON goal_lists ("order");
