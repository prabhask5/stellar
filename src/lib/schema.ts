/**
 * @fileoverview Declarative schema definition for Stellar.
 *
 * This file is the single source of truth for the database schema. It is
 * consumed in two places:
 *
 * 1. **Runtime** — imported by `+layout.ts` and passed to `initEngine()` to
 *    configure IndexedDB (Dexie) stores and table configs.
 *
 * 2. **Build / dev time** — loaded by the `stellarPWA` Vite plugin to
 *    auto-generate TypeScript types (`src/lib/types.generated.ts`) and
 *    push Supabase migration SQL when the schema changes.
 *
 * To add or modify tables, edit this file and save. The Vite plugin will
 * automatically regenerate types and diff the schema for migrations.
 */

import type { SchemaDefinition } from 'stellar-drive/types';

export const schema: SchemaDefinition = {
  goal_lists: {
    indexes: 'project_id, order',
    fields: { name: 'string', project_id: 'uuid?', order: 'number' }
  },
  goals: {
    indexes: 'goal_list_id, order',
    ownership: { parent: 'goal_lists', fk: 'goal_list_id' },
    fields: {
      goal_list_id: 'uuid',
      name: 'string',
      type: 'string',
      target_value: 'number?',
      current_value: 'number',
      completed: 'boolean',
      order: 'number'
    }
  },
  daily_routine_goals: {
    indexes: 'order, start_date, end_date',
    fields: {
      name: 'string',
      type: 'string',
      target_value: 'number?',
      start_date: 'date',
      end_date: 'date?',
      active_days: 'json?',
      start_target_value: 'number?',
      end_target_value: 'number?',
      progression_schedule: 'number?',
      order: 'number'
    }
  },
  daily_goal_progress: {
    indexes: 'daily_routine_goal_id, date, [daily_routine_goal_id+date]',
    ownership: { parent: 'daily_routine_goals', fk: 'daily_routine_goal_id' },
    fields: {
      daily_routine_goal_id: 'uuid',
      date: 'date',
      current_value: 'number',
      completed: 'boolean'
    }
  },
  task_categories: {
    indexes: 'project_id, order',
    fields: { name: 'string', color: 'string', order: 'number', project_id: 'uuid?' }
  },
  commitments: {
    indexes: 'project_id, section, order',
    fields: { name: 'string', section: 'string', order: 'number', project_id: 'uuid?' }
  },
  daily_tasks: {
    indexes: 'long_term_task_id, order',
    fields: {
      name: 'string',
      long_term_task_id: 'uuid?',
      order: 'number',
      completed: 'boolean'
    }
  },
  long_term_agenda: {
    typeName: 'LongTermTask',
    indexes: 'due_date, category_id, type',
    fields: {
      name: 'string',
      due_date: 'date',
      category_id: 'uuid?',
      type: 'string',
      completed: 'boolean'
    }
  },
  focus_settings: {
    singleton: true,
    fields: {
      focus_duration: 'number',
      break_duration: 'number',
      long_break_duration: 'number',
      cycles_before_long_break: 'number',
      auto_start_breaks: 'boolean',
      auto_start_focus: 'boolean'
    }
  },
  focus_sessions: {
    indexes: 'started_at, ended_at, status',
    fields: {
      started_at: 'timestamp',
      ended_at: 'timestamp?',
      phase: 'string',
      status: 'string',
      current_cycle: 'number',
      total_cycles: 'number',
      focus_duration: 'number',
      break_duration: 'number',
      phase_started_at: 'timestamp',
      phase_remaining_ms: 'number',
      elapsed_duration: 'number'
    }
  },
  block_lists: {
    indexes: 'order',
    fields: { name: 'string', active_days: 'json?', is_enabled: 'boolean', order: 'number' }
  },
  blocked_websites: {
    indexes: 'block_list_id',
    ownership: { parent: 'block_lists', fk: 'block_list_id' },
    fields: { block_list_id: 'uuid', domain: 'string' }
  },
  task_lists: {
    indexes: 'order',
    fields: { name: 'string', order: 'number' }
  },
  task_list_items: {
    indexes: 'task_list_id, order',
    ownership: { parent: 'task_lists', fk: 'task_list_id' },
    fields: {
      task_list_id: 'uuid',
      name: 'string',
      completed: 'boolean',
      order: 'number'
    }
  },
  projects: {
    indexes: 'is_current, order',
    fields: {
      name: 'string',
      is_current: 'boolean',
      order: 'number',
      tag_id: 'uuid?',
      commitment_id: 'uuid?',
      goal_list_id: 'uuid?'
    }
  }
};
