/**
 * @fileoverview Repository for **project** entities.
 *
 * A project is the highest-level organizational unit in Stellar.  Each project
 * is a composite entity that owns three child records created atomically:
 * - A {@link TaskCategory} (tag) — for categorizing long-term tasks
 * - A {@link Commitment} — placed in the `"projects"` section
 * - A {@link GoalList} — for tracking project-specific goals
 *
 * All child entities share the project's name, and renames cascade across
 * every linked record.  Only one project can be marked `is_current` at a time.
 *
 * Cascade behaviour:
 * - **Create** — atomically creates project + tag + commitment + goal list
 * - **Rename** — batch-updates project + tag + commitment + goal list names
 * - **Delete** — cascade-deletes all goals, goal list, tagged long-term tasks
 *   (and their linked daily tasks), tag, commitment, and the project itself
 *
 * Table: `projects`
 * Children: `task_categories`, `commitments`, `goal_lists` (all via `project_id`)
 * Grandchildren: `goals` (via `goal_list_id`)
 *
 * @module repositories/projects
 */

import { generateId, now } from '@prabhask5/stellar-engine/utils';
import {
  engineQuery,
  engineGet,
  engineBatchWrite,
  reorderEntity,
  prependOrder
} from '@prabhask5/stellar-engine/data';
import type { BatchOperation } from '@prabhask5/stellar-engine/types';
import type { Project, TaskCategory, Commitment, GoalList, Goal, DailyTask } from '$lib/types';

// =============================================================================
//                              Constants
// =============================================================================

/**
 * Palette of tag colours randomly assigned when creating a new project.
 * Each hex colour is chosen to be visually distinct and legible on both
 * light and dark backgrounds.
 */
const TAG_COLORS = [
  '#6c5ce7' /* Purple (primary) */,
  '#a29bfe' /* Light purple */,
  '#00d4ff' /* Cyan */,
  '#26de81' /* Green */,
  '#ffd93d' /* Yellow */,
  '#ff6b6b' /* Red */,
  '#fd79a8' /* Pink */,
  '#fdcb6e' /* Orange */,
  '#74b9ff' /* Blue */,
  '#55efc4' /* Teal */
];

// =============================================================================
//                           Internal Helpers
// =============================================================================

/**
 * Selects a random colour from {@link TAG_COLORS} for new project tags.
 *
 * @returns A hex colour string (e.g. `"#6c5ce7"`)
 */
function getRandomColor(): string {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

/**
 * Computes the next prepend-order value for a new project.
 *
 * Returns `min(existing orders) - 1` so new projects appear first when
 * sorted ascending.  Returns `0` if the user has no projects yet.
 *
 * @param userId - The owning user's identifier
 * @returns The order value to assign to the new project
 */
async function getNextProjectOrder(userId: string): Promise<number> {
  return prependOrder('projects', 'user_id', userId);
}

// =============================================================================
//                            Write Operations
// =============================================================================

/**
 * Creates a new project with its associated tag, commitment, and goal list atomically.
 *
 * All child entities are marked with `project_id` to indicate project ownership.
 *
 * Order of operations for sync:
 *   1. Create project first (so `project_id` FK on children is satisfied)
 *   2. Create tag, commitment, goal list (with `project_id`)
 *
 * @param name   - Display name for the project (shared by all child entities)
 * @param userId - The owning user's identifier
 * @returns The newly created {@link Project}
 */
export async function createProject(name: string, userId: string): Promise<Project> {
  const timestamp = now();
  const projectId = generateId();
  const tagId = generateId();
  const commitmentId = generateId();
  const goalListId = generateId();
  const tagColor = getRandomColor();

  const order = await getNextProjectOrder(userId);

  /* ── Build the project record ──── */
  const newProject: Project = {
    id: projectId,
    user_id: userId,
    name,
    is_current: false,
    order,
    tag_id: tagId,
    commitment_id: commitmentId,
    goal_list_id: goalListId,
    created_at: timestamp,
    updated_at: timestamp
  };

  /* ── Build the tag (TaskCategory) for this project ──── */
  const newTag: TaskCategory = {
    id: tagId,
    user_id: userId,
    name,
    color: tagColor,
    order: 0,
    project_id: projectId,
    created_at: timestamp,
    updated_at: timestamp
  };

  /* ── Build the commitment for this project ──── */
  const newCommitment: Commitment = {
    id: commitmentId,
    user_id: userId,
    name,
    section: 'projects',
    order: 0,
    project_id: projectId,
    created_at: timestamp,
    updated_at: timestamp
  };

  /* ── Build the goal list for this project ──── */
  const newGoalList: GoalList = {
    id: goalListId,
    user_id: userId,
    name,
    project_id: projectId,
    order: 0,
    created_at: timestamp,
    updated_at: timestamp
  };

  /* ── Atomic batch write: project + tag + commitment + goal list ──── */
  await engineBatchWrite([
    { type: 'create', table: 'projects', data: newProject as unknown as Record<string, unknown> },
    {
      type: 'create',
      table: 'task_categories',
      data: newTag as unknown as Record<string, unknown>
    },
    {
      type: 'create',
      table: 'commitments',
      data: newCommitment as unknown as Record<string, unknown>
    },
    { type: 'create', table: 'goal_lists', data: newGoalList as unknown as Record<string, unknown> }
  ]);

  return newProject;
}

/**
 * Renames a project and cascades the name change to all linked entities.
 *
 * Uses a batch write to atomically update the project, its tag, commitment,
 * and goal list names in a single operation.
 *
 * @param id   - The project's unique identifier
 * @param name - The new display name
 * @returns The updated {@link Project}, or `undefined` if not found
 */
export async function updateProject(id: string, name: string): Promise<Project | undefined> {
  const project = (await engineGet('projects', id)) as unknown as Project | null;
  if (!project) return undefined;

  const ops: BatchOperation[] = [{ type: 'update', table: 'projects', id, fields: { name } }];

  /* ── Cascade name to linked tag ──── */
  if (project.tag_id) {
    ops.push({ type: 'update', table: 'task_categories', id: project.tag_id, fields: { name } });
  }

  /* ── Cascade name to linked commitment ──── */
  if (project.commitment_id) {
    ops.push({ type: 'update', table: 'commitments', id: project.commitment_id, fields: { name } });
  }

  /* ── Cascade name to linked goal list ──── */
  if (project.goal_list_id) {
    ops.push({ type: 'update', table: 'goal_lists', id: project.goal_list_id, fields: { name } });
  }

  await engineBatchWrite(ops);

  /* ── Read back the updated project ──── */
  const updated = (await engineGet('projects', id)) as unknown as Project | null;
  return updated ?? undefined;
}

// =============================================================================
//                           Delete Operations
// =============================================================================

/**
 * Deletes a project and all its associated entities (full cascade delete).
 *
 * The cascade covers:
 *   1. All {@link Goal} items within the project's goal list
 *   2. The {@link GoalList} itself
 *   3. Any `long_term_agenda` items referencing the project's tag — these
 *      are **unlinked** (category set to `null`) rather than deleted
 *   4. The {@link TaskCategory} (tag)
 *   5. The {@link Commitment}
 *   6. The project record itself
 *
 * @param id - The project's unique identifier
 */
export async function deleteProject(id: string): Promise<void> {
  const project = (await engineGet('projects', id)) as unknown as Project | null;
  if (!project) return;

  /* ── Gather goals in the project's goal list ──── */
  const goals = project.goal_list_id
    ? ((await engineQuery('goals', 'goal_list_id', project.goal_list_id)) as unknown as Goal[])
    : [];

  /* ── Find long-term tasks tagged with the project's tag ──── */
  const tasksWithTag = project.tag_id
    ? ((await engineQuery('long_term_agenda', 'category_id', project.tag_id)) as unknown as Array<{
        id: string;
      }>)
    : [];

  /* ── Find linked daily tasks for each long-term task (for cascade delete) ──── */
  const linkedDailyTasks: DailyTask[] = [];
  for (const task of tasksWithTag) {
    const dailyTasks = (await engineQuery(
      'daily_tasks',
      'long_term_task_id',
      task.id
    )) as unknown as DailyTask[];
    for (const dt of dailyTasks) {
      if (!dt.deleted) linkedDailyTasks.push(dt);
    }
  }

  const ops: BatchOperation[] = [];

  /* ── Delete goals in the goal list ──── */
  for (const goal of goals) {
    ops.push({ type: 'delete', table: 'goals', id: goal.id });
  }

  /* ── Delete the goal list ──── */
  if (project.goal_list_id) {
    ops.push({ type: 'delete', table: 'goal_lists', id: project.goal_list_id });
  }

  /* ── Delete linked daily tasks ──── */
  for (const dt of linkedDailyTasks) {
    ops.push({ type: 'delete', table: 'daily_tasks', id: dt.id });
  }

  /* ── Delete long-term tasks tagged with the project ──── */
  for (const task of tasksWithTag) {
    ops.push({ type: 'delete', table: 'long_term_agenda', id: task.id });
  }

  /* ── Delete the tag ──── */
  if (project.tag_id) {
    ops.push({ type: 'delete', table: 'task_categories', id: project.tag_id });
  }

  /* ── Delete the commitment ──── */
  if (project.commitment_id) {
    ops.push({ type: 'delete', table: 'commitments', id: project.commitment_id });
  }

  /* ── Delete the project itself ──── */
  ops.push({ type: 'delete', table: 'projects', id });

  await engineBatchWrite(ops);
}

// =============================================================================
//                       Current Project Management
// =============================================================================

/**
 * Sets a project as the user's current (active) project.
 *
 * Only one project can be `is_current` at a time — any previously current
 * projects are unset in the same batch write.
 *
 * @param id - The project's unique identifier to mark as current
 */
export async function setCurrentProject(id: string): Promise<void> {
  const project = (await engineGet('projects', id)) as unknown as Project | null;
  if (!project) return;

  /* ── Find any other projects currently marked as current ──── */
  const allProjects = (await engineQuery(
    'projects',
    'user_id',
    project.user_id
  )) as unknown as Project[];
  const currentProjects = allProjects.filter((p) => p.is_current && !p.deleted && p.id !== id);

  const ops: BatchOperation[] = [];

  /* ── Unset all other current projects ──── */
  for (const current of currentProjects) {
    ops.push({ type: 'update', table: 'projects', id: current.id, fields: { is_current: false } });
  }

  /* ── Set the target project as current ──── */
  ops.push({ type: 'update', table: 'projects', id, fields: { is_current: true } });

  await engineBatchWrite(ops);
}

/**
 * Clears the `is_current` flag from all of a user's projects.
 *
 * After this call, no project will be marked as the active project.
 *
 * @param userId - The owning user's identifier
 */
export async function clearCurrentProject(userId: string): Promise<void> {
  const allProjects = (await engineQuery('projects', 'user_id', userId)) as unknown as Project[];
  const currentProjects = allProjects.filter((p) => p.is_current && !p.deleted);

  if (currentProjects.length === 0) return;

  const ops: BatchOperation[] = [];

  for (const current of currentProjects) {
    ops.push({ type: 'update', table: 'projects', id: current.id, fields: { is_current: false } });
  }

  await engineBatchWrite(ops);
}

// =============================================================================
//                            Reorder Operations
// =============================================================================

/**
 * Updates the display order of a project.
 *
 * @param id       - The project's unique identifier
 * @param newOrder - The new ordinal position
 * @returns The updated {@link Project}, or `undefined` if not found
 */
export async function reorderProject(id: string, newOrder: number): Promise<Project | undefined> {
  return reorderEntity('projects', id, newOrder) as Promise<Project | undefined>;
}
