/**
 * Conflict Resolution Module
 *
 * Handles conflict detection and resolution for multi-device sync.
 *
 * Resolution Strategy:
 * - Different entities: Auto-merge (no conflict)
 * - Same entity, different fields: Auto-merge fields
 * - Same entity, same field (text): Last-write-wins
 * - Same entity, increment operations: Sum deltas (server-side)
 * - Edit + Delete: Delete wins
 * - Create + Delete (same device): Cancel out
 *
 * For increment/toggle operations, true conflict resolution happens
 * server-side via PostgreSQL functions. This module handles the
 * client-side detection and field-level merging.
 */

import type { SyncOperationType, SyncQueueTable } from '$lib/types';

/**
 * Conflict types that can occur during sync.
 */
export type ConflictType =
  | 'none'              // No conflict
  | 'field_merge'       // Same entity, different fields - auto-merge
  | 'last_write_wins'   // Same field, use timestamp to resolve
  | 'delete_wins'       // Edit vs Delete - delete takes precedence
  | 'create_delete'     // Create then Delete - cancel out
  | 'increment_merge';  // Increment operations - sum deltas

/**
 * Result of conflict detection.
 */
export interface ConflictDetectionResult {
  type: ConflictType;
  resolution: 'auto' | 'local_wins' | 'remote_wins' | 'merge' | 'cancel';
  mergedPayload?: Record<string, unknown>;
  explanation: string;
}

/**
 * Compare two entity versions to detect conflicts.
 */
export function detectConflict(
  localOperation: SyncOperationType,
  localPayload: Record<string, unknown>,
  localTimestamp: string,
  remotePayload: Record<string, unknown>,
  remoteTimestamp: string,
  remoteDeleted: boolean
): ConflictDetectionResult {
  // Case 1: Remote was deleted
  if (remoteDeleted) {
    if (localOperation === 'delete') {
      // Both trying to delete - no conflict
      return {
        type: 'none',
        resolution: 'auto',
        explanation: 'Both devices deleted the entity'
      };
    }
    // Edit vs Delete - delete wins
    return {
      type: 'delete_wins',
      resolution: 'remote_wins',
      explanation: 'Remote deleted the entity - delete takes precedence over edit'
    };
  }

  // Case 2: Local is a delete operation
  if (localOperation === 'delete') {
    // Delete vs Edit - delete wins
    return {
      type: 'delete_wins',
      resolution: 'local_wins',
      explanation: 'Local deleted the entity - delete takes precedence over edit'
    };
  }

  // Case 3: Create operation - no conflict with existing remote
  if (localOperation === 'create') {
    // This shouldn't happen if entity already exists on server
    // If it does, it's a duplicate - let server handle it
    return {
      type: 'none',
      resolution: 'auto',
      explanation: 'Create operation - server will handle duplicate'
    };
  }

  // Case 4: Both are updates - check for field-level conflicts
  const localFields = Object.keys(localPayload).filter(k => k !== 'updated_at');
  const remoteFields = Object.keys(remotePayload).filter(k => k !== 'updated_at');

  // Find overlapping fields
  const overlappingFields = localFields.filter(f => remoteFields.includes(f));

  if (overlappingFields.length === 0) {
    // Different fields - auto-merge
    return {
      type: 'field_merge',
      resolution: 'merge',
      mergedPayload: { ...remotePayload, ...localPayload },
      explanation: 'Different fields modified - auto-merged'
    };
  }

  // Check if overlapping fields have the same value
  const conflictingFields = overlappingFields.filter(f =>
    JSON.stringify(localPayload[f]) !== JSON.stringify(remotePayload[f])
  );

  if (conflictingFields.length === 0) {
    // Same values - no conflict
    return {
      type: 'none',
      resolution: 'auto',
      explanation: 'Same changes made on both devices'
    };
  }

  // True conflict - use timestamp (last-write-wins)
  const localTime = new Date(localTimestamp).getTime();
  const remoteTime = new Date(remoteTimestamp).getTime();

  if (localTime >= remoteTime) {
    // Local is newer
    return {
      type: 'last_write_wins',
      resolution: 'local_wins',
      mergedPayload: { ...remotePayload, ...localPayload },
      explanation: `Local change is newer (${conflictingFields.join(', ')} conflict) - local wins`
    };
  } else {
    // Remote is newer
    return {
      type: 'last_write_wins',
      resolution: 'remote_wins',
      mergedPayload: { ...localPayload, ...remotePayload },
      explanation: `Remote change is newer (${conflictingFields.join(', ')} conflict) - remote wins`
    };
  }
}

/**
 * Check if a queue item can be merged with another (for coalescing).
 */
export function canCoalesce(
  op1Type: SyncOperationType,
  op2Type: SyncOperationType
): boolean {
  // Same operation types can usually be coalesced
  if (op1Type === op2Type) return true;

  // Create followed by delete = cancel out
  if (op1Type === 'create' && op2Type === 'delete') return true;
  if (op1Type === 'delete' && op2Type === 'create') return true;

  // Create followed by update = enhanced create
  if (op1Type === 'create' && op2Type === 'update') return true;

  // Update followed by delete = just delete
  if (op1Type === 'update' && op2Type === 'delete') return true;

  // Increment operations can be summed
  if (op1Type === 'increment' && op2Type === 'increment') return true;
  if (op1Type === 'decrement' && op2Type === 'decrement') return true;
  if (op1Type === 'increment' && op2Type === 'decrement') return true;
  if (op1Type === 'decrement' && op2Type === 'increment') return true;

  // Toggle operations can cancel out
  if (op1Type === 'toggle' && op2Type === 'toggle') return true;

  return false;
}

/**
 * Coalesce two operations into one.
 * Returns the resulting operation and payload, or null if they cancel out.
 */
export function coalesceOperations(
  op1Type: SyncOperationType,
  op1Payload: Record<string, unknown>,
  op2Type: SyncOperationType,
  op2Payload: Record<string, unknown>
): { operation: SyncOperationType; payload: Record<string, unknown> } | null {
  // Create + Delete = cancel out
  if (op1Type === 'create' && op2Type === 'delete') {
    return null; // Entity never existed server-side
  }

  // Delete + Create = recreate (use create)
  if (op1Type === 'delete' && op2Type === 'create') {
    return { operation: 'create', payload: op2Payload };
  }

  // Create + Update = enhanced create
  if (op1Type === 'create' && op2Type === 'update') {
    return {
      operation: 'create',
      payload: { ...op1Payload, ...op2Payload }
    };
  }

  // Update + Delete = just delete
  if (op1Type === 'update' && op2Type === 'delete') {
    return { operation: 'delete', payload: op2Payload };
  }

  // Update + Update = merge payloads (later wins per field)
  if (op1Type === 'update' && op2Type === 'update') {
    return {
      operation: 'update',
      payload: { ...op1Payload, ...op2Payload }
    };
  }

  // Increment + Increment = sum deltas
  if (
    (op1Type === 'increment' || op1Type === 'decrement') &&
    (op2Type === 'increment' || op2Type === 'decrement')
  ) {
    const delta1 = op1Type === 'increment'
      ? (op1Payload.delta as number) || 0
      : -((op1Payload.delta as number) || 0);
    const delta2 = op2Type === 'increment'
      ? (op2Payload.delta as number) || 0
      : -((op2Payload.delta as number) || 0);

    const totalDelta = delta1 + delta2;

    if (totalDelta === 0) {
      return null; // Increments cancelled out
    }

    return {
      operation: totalDelta > 0 ? 'increment' : 'decrement',
      payload: {
        ...op1Payload,
        ...op2Payload,
        delta: Math.abs(totalDelta)
      }
    };
  }

  // Toggle + Toggle = cancel out (even toggles = no-op)
  if (op1Type === 'toggle' && op2Type === 'toggle') {
    // Check if same field
    if (op1Payload.field === op2Payload.field) {
      return null; // Toggles cancelled out
    }
    // Different fields - keep both as separate updates
    // This case shouldn't happen in practice
  }

  // Default: keep later operation
  return { operation: op2Type, payload: op2Payload };
}

/**
 * Determine the appropriate operation type for a field change.
 * This helps repositories choose between update, increment, toggle.
 */
export function getOperationTypeForChange(
  table: SyncQueueTable,
  field: string,
  _oldValue: unknown,
  _newValue: unknown
): SyncOperationType {
  // Numeric fields that should use increment
  const incrementFields: Record<string, string[]> = {
    goals: ['current_value'],
    daily_goal_progress: ['current_value']
  };

  // Boolean fields that should use toggle
  const toggleFields: Record<string, string[]> = {
    goals: ['completed'],
    daily_goal_progress: ['completed'],
    daily_tasks: ['completed'],
    long_term_tasks: ['completed']
  };

  if (incrementFields[table]?.includes(field)) {
    return 'increment';
  }

  if (toggleFields[table]?.includes(field)) {
    return 'toggle';
  }

  return 'update';
}

/**
 * Log conflict for debugging/monitoring.
 */
export function logConflict(
  table: string,
  entityId: string,
  result: ConflictDetectionResult
): void {
  if (result.type === 'none') return;

  console.log(
    `[Conflict] ${table}:${entityId} - ${result.type} - ${result.resolution}: ${result.explanation}`
  );
}

// Expose for debugging
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__stellarConflicts = {
    detectConflict,
    canCoalesce,
    coalesceOperations,
    getOperationTypeForChange
  };
}
