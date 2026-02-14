/**
 * @fileoverview Barrel export for all Stellar repository modules.
 *
 * Each repository encapsulates the **write** operations (create, update,
 * delete, reorder) for a single domain entity.  Read-only aggregate queries
 * live in {@link ../queries.ts} instead.
 *
 * Re-exported repositories:
 * - {@link goalLists}       — Goal list CRUD + cascade name sync
 * - {@link goals}           — Individual goal CRUD + increment
 * - {@link dailyRoutines}   — Daily routine goal CRUD + cascade delete
 * - {@link dailyProgress}   — Upsert / increment daily progress records
 * - {@link taskCategories}  — Task category (tag) CRUD + unlink on delete
 * - {@link commitments}     — Commitment CRUD
 * - {@link dailyTasks}      — Daily task CRUD + bi-directional sync
 * - {@link longTermTasks}   — Long-term agenda CRUD + spawned task sync
 * - {@link focusSettings}   — Focus timer settings get-or-create + update
 * - {@link focusSessions}   — Focus session lifecycle management
 * - {@link blockLists}      — Website block list CRUD + cascade delete
 * - {@link blockedWebsites} — Individual blocked website CRUD
 * - {@link projects}        — Project CRUD + multi-entity cascade
 *
 * @module repositories
 */

export * from './goalLists';
export * from './goals';
export * from './dailyRoutines';
export * from './dailyProgress';
export * from './taskCategories';
export * from './commitments';
export * from './dailyTasks';
export * from './longTermTasks';
export * from './focusSettings';
export * from './focusSessions';
export * from './blockLists';
export * from './blockedWebsites';
export * from './projects';
