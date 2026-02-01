import { generateId, now } from '@prabhask5/stellar-engine/utils';
import {
  engineUpdate,
  engineQuery,
  engineGet,
  engineBatchWrite
} from '@prabhask5/stellar-engine/data';
import type { BatchOperation } from '@prabhask5/stellar-engine/types';
import type { Project, TaskCategory, Commitment, GoalList, Goal } from '$lib/types';

// Color palette for random tag colors
const TAG_COLORS = [
  '#6c5ce7', // Purple (primary)
  '#a29bfe', // Light purple
  '#00d4ff', // Cyan
  '#26de81', // Green
  '#ffd93d', // Yellow
  '#ff6b6b', // Red
  '#fd79a8', // Pink
  '#fdcb6e', // Orange
  '#74b9ff', // Blue
  '#55efc4' // Teal
];

function getRandomColor(): string {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

async function getNextProjectOrder(userId: string): Promise<number> {
  const existing = (await engineQuery('projects', 'user_id', userId)) as unknown as Project[];
  const active = existing.filter((p) => !p.deleted);
  if (active.length === 0) return 0;
  return Math.min(...active.map((p) => p.order)) - 1;
}

/**
 * Creates a new project with its associated tag, commitment, and goal list atomically.
 * All child entities are marked with project_id to indicate project ownership.
 *
 * Order of operations for sync:
 * 1. Create project first (so project_id FK on children is satisfied)
 * 2. Create tag, commitment, goal list (with project_id)
 */
export async function createProject(name: string, userId: string): Promise<Project> {
  const timestamp = now();
  const projectId = generateId();
  const tagId = generateId();
  const commitmentId = generateId();
  const goalListId = generateId();
  const tagColor = getRandomColor();

  const order = await getNextProjectOrder(userId);

  // Create the project itself
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

  // Create the tag (TaskCategory) for this project
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

  // Create the commitment for this project
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

  // Create the goal list for this project
  const newGoalList: GoalList = {
    id: goalListId,
    user_id: userId,
    name,
    project_id: projectId,
    order: 0,
    created_at: timestamp,
    updated_at: timestamp
  };

  // Use engineBatchWrite for atomic multi-entity creation
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
 * Updates a project's name. Also updates the associated tag and commitment names.
 */
export async function updateProject(id: string, name: string): Promise<Project | undefined> {
  const project = (await engineGet('projects', id)) as unknown as Project | null;
  if (!project) return undefined;

  const ops: BatchOperation[] = [{ type: 'update', table: 'projects', id, fields: { name } }];

  // Update the associated tag name
  if (project.tag_id) {
    ops.push({ type: 'update', table: 'task_categories', id: project.tag_id, fields: { name } });
  }

  // Update the associated commitment name
  if (project.commitment_id) {
    ops.push({ type: 'update', table: 'commitments', id: project.commitment_id, fields: { name } });
  }

  // Update the associated goal list name
  if (project.goal_list_id) {
    ops.push({ type: 'update', table: 'goal_lists', id: project.goal_list_id, fields: { name } });
  }

  await engineBatchWrite(ops);

  // Read back the updated project
  const updated = (await engineGet('projects', id)) as unknown as Project | null;
  return updated ?? undefined;
}

/**
 * Deletes a project and all its associated entities (cascade delete).
 * - Deletes the project's goal list and all its goals
 * - Deletes the project's tag (tasks using this tag become untagged)
 * - Deletes the project's commitment
 */
export async function deleteProject(id: string): Promise<void> {
  const project = (await engineGet('projects', id)) as unknown as Project | null;
  if (!project) return;

  // Get goals in the goal list
  const goals = project.goal_list_id
    ? ((await engineQuery('goals', 'goal_list_id', project.goal_list_id)) as unknown as Goal[])
    : [];

  // Get tasks that reference the project's tag (to unlink them)
  const tasksWithTag = project.tag_id
    ? ((await engineQuery('long_term_tasks', 'category_id', project.tag_id)) as unknown as Array<{
        id: string;
      }>)
    : [];

  const ops: BatchOperation[] = [];

  // Delete goals in the goal list
  for (const goal of goals) {
    ops.push({ type: 'delete', table: 'goals', id: goal.id });
  }

  // Delete the goal list
  if (project.goal_list_id) {
    ops.push({ type: 'delete', table: 'goal_lists', id: project.goal_list_id });
  }

  // Unlink tasks from the tag before deleting it
  for (const task of tasksWithTag) {
    ops.push({
      type: 'update',
      table: 'long_term_tasks',
      id: task.id,
      fields: { category_id: null }
    });
  }

  // Delete the tag
  if (project.tag_id) {
    ops.push({ type: 'delete', table: 'task_categories', id: project.tag_id });
  }

  // Delete the commitment
  if (project.commitment_id) {
    ops.push({ type: 'delete', table: 'commitments', id: project.commitment_id });
  }

  // Delete the project itself
  ops.push({ type: 'delete', table: 'projects', id });

  await engineBatchWrite(ops);
}

/**
 * Sets a project as the current project (unsets any other current project).
 */
export async function setCurrentProject(id: string): Promise<void> {
  const project = (await engineGet('projects', id)) as unknown as Project | null;
  if (!project) return;

  // Get all projects for this user
  const allProjects = (await engineQuery(
    'projects',
    'user_id',
    project.user_id
  )) as unknown as Project[];
  const currentProjects = allProjects.filter((p) => p.is_current && !p.deleted && p.id !== id);

  const ops: BatchOperation[] = [];

  // Unset any other current projects
  for (const current of currentProjects) {
    ops.push({ type: 'update', table: 'projects', id: current.id, fields: { is_current: false } });
  }

  // Set this project as current
  ops.push({ type: 'update', table: 'projects', id, fields: { is_current: true } });

  await engineBatchWrite(ops);
}

/**
 * Clears the current project status from all projects.
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

/**
 * Reorders a project to a new position.
 */
export async function reorderProject(id: string, newOrder: number): Promise<Project | undefined> {
  const result = await engineUpdate('projects', id, { order: newOrder });
  return result as unknown as Project | undefined;
}
