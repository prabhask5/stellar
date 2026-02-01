<script lang="ts">
  import Modal from './Modal.svelte';
  import { remoteChangeAnimation } from '@prabhask5/stellar-engine/actions';
  import { calculateNewOrder } from '@prabhask5/stellar-engine/utils';
  import { truncateTooltip } from '$lib/actions/truncateTooltip';
  import type { Commitment, CommitmentSection } from '$lib/types';

  interface Props {
    open: boolean;
    commitments: Commitment[];
    onClose: () => void;
    onCreate: (name: string, section: CommitmentSection) => void;
    onUpdate: (id: string, name: string) => void;
    onDelete: (id: string) => void;
    onReorder: (id: string, newOrder: number) => void;
  }

  let { open, commitments, onClose, onCreate, onUpdate, onDelete, onReorder }: Props = $props();

  // Focus action for accessibility (skip on mobile to avoid keyboard popup)
  function focus(node: HTMLElement) {
    if (window.innerWidth > 640) {
      node.focus();
    }
  }

  const sections: { key: CommitmentSection; label: string }[] = [
    { key: 'career', label: 'CAREER' },
    { key: 'personal', label: 'PERSONAL' },
    { key: 'projects', label: 'PROJECTS' }
  ];

  // Check if a commitment is project-owned (cannot be edited/deleted independently)
  function isProjectOwned(commitment: Commitment): boolean {
    return !!commitment.project_id;
  }

  let addingTo = $state<CommitmentSection | null>(null);
  let newName = $state('');
  let editingId = $state<string | null>(null);
  let editingName = $state('');

  // Drag state — pointer-event based (works on touch + mouse)
  let draggedId = $state<string | null>(null);
  let draggedSection = $state<CommitmentSection | null>(null);
  let draggedIndex = $state<number>(-1);
  let dropTargetIndex = $state<number>(-1);
  let sectionListEls: Record<string, HTMLDivElement> = {};

  function getCommitmentsForSection(section: CommitmentSection): Commitment[] {
    return commitments.filter((c) => c.section === section).sort((a, b) => a.order - b.order);
  }

  function handleAddClick(section: CommitmentSection) {
    addingTo = section;
    newName = '';
  }

  function handleAddSubmit(section: CommitmentSection) {
    if (!newName.trim()) return;
    onCreate(newName.trim(), section);
    addingTo = null;
    newName = '';
  }

  function handleAddKeydown(e: KeyboardEvent, section: CommitmentSection) {
    if (e.key === 'Enter') {
      handleAddSubmit(section);
    } else if (e.key === 'Escape') {
      addingTo = null;
      newName = '';
    }
  }

  function startEditing(commitment: Commitment) {
    editingId = commitment.id;
    editingName = commitment.name;
  }

  function handleEditSubmit() {
    if (editingId && editingName.trim()) {
      onUpdate(editingId, editingName.trim());
    }
    editingId = null;
    editingName = '';
  }

  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      editingId = null;
      editingName = '';
    }
  }

  // Pointer-event based drag (works on both touch and mouse)
  function handlePointerDown(
    e: PointerEvent,
    commitment: Commitment,
    section: CommitmentSection,
    index: number
  ) {
    if (isProjectOwned(commitment)) return;
    const sectionItems = getCommitmentsForSection(section);
    if (sectionItems.length <= 1) return;
    if (e.button !== 0) return;

    e.preventDefault();
    draggedId = commitment.id;
    draggedSection = section;
    draggedIndex = index;
    dropTargetIndex = index;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
  }

  function handlePointerMove(e: PointerEvent) {
    if (draggedId === null || !draggedSection) return;

    const listEl = sectionListEls[draggedSection];
    if (!listEl) return;

    const itemElements = listEl.querySelectorAll('[data-commitment-item]');
    let newDropIndex = itemElements.length - 1;

    for (let i = 0; i < itemElements.length; i++) {
      const itemEl = itemElements[i] as HTMLElement;
      const itemRect = itemEl.getBoundingClientRect();
      const itemMiddle = itemRect.top + itemRect.height / 2;

      if (e.clientY < itemMiddle) {
        newDropIndex = i;
        break;
      }
    }

    dropTargetIndex = newDropIndex;
  }

  function handlePointerUp() {
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointercancel', handlePointerUp);

    if (draggedId === null || draggedSection === null || draggedIndex === -1) {
      resetDragState();
      return;
    }

    const fromIndex = draggedIndex;
    const toIndex = dropTargetIndex;
    const itemId = draggedId;
    const sectionItems = getCommitmentsForSection(draggedSection);

    resetDragState();

    if (fromIndex !== toIndex && sectionItems.length > 1) {
      const newOrder = calculateNewOrder(sectionItems, fromIndex, toIndex);
      onReorder(itemId, newOrder);
    }
  }

  function resetDragState() {
    draggedId = null;
    draggedSection = null;
    draggedIndex = -1;
    dropTargetIndex = -1;
  }
</script>

<Modal {open} title="Commitments" {onClose}>
  <div class="commitments-content">
    {#each sections as section (section.key)}
      <div class="section" class:projects-section={section.key === 'projects'}>
        <div class="section-header">
          <h3 class="section-title">{section.label}</h3>
          {#if section.key !== 'projects'}
            <button
              class="add-section-btn"
              onclick={() => handleAddClick(section.key)}
              aria-label="Add commitment"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          {:else}
            <span class="section-hint">via Plans</span>
          {/if}
        </div>

        {#if addingTo === section.key}
          <div class="add-form">
            <input
              type="text"
              bind:value={newName}
              placeholder="New commitment..."
              class="add-input"
              onkeydown={(e) => handleAddKeydown(e, section.key)}
              use:focus
            />
            <button
              class="confirm-btn"
              onclick={() => handleAddSubmit(section.key)}
              disabled={!newName.trim()}
              aria-label="Confirm"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            <button
              class="cancel-btn"
              onclick={() => {
                addingTo = null;
                newName = '';
              }}
              aria-label="Cancel"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        {/if}

        <div class="items-list" bind:this={sectionListEls[section.key]}>
          {#each getCommitmentsForSection(section.key) as commitment, index (commitment.id)}
            <div
              class="commitment-item"
              class:dragging={draggedId === commitment.id}
              class:drop-above={draggedId !== null &&
                draggedSection === section.key &&
                dropTargetIndex === index &&
                draggedIndex > index}
              class:drop-below={draggedId !== null &&
                draggedSection === section.key &&
                dropTargetIndex === index &&
                draggedIndex < index}
              class:project-owned={isProjectOwned(commitment)}
              data-commitment-item
              use:remoteChangeAnimation={{ entityId: commitment.id, entityType: 'commitments' }}
            >
              {#if !isProjectOwned(commitment)}
                <span
                  class="drag-handle-icon"
                  onpointerdown={(e) => handlePointerDown(e, commitment, section.key, index)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="9" cy="6" r="1.5" />
                    <circle cx="15" cy="6" r="1.5" />
                    <circle cx="9" cy="12" r="1.5" />
                    <circle cx="15" cy="12" r="1.5" />
                    <circle cx="9" cy="18" r="1.5" />
                    <circle cx="15" cy="18" r="1.5" />
                  </svg>
                </span>
              {:else}
                <span class="project-icon" title="Managed by project">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                    />
                  </svg>
                </span>
              {/if}

              {#if editingId === commitment.id && !isProjectOwned(commitment)}
                <input
                  type="text"
                  bind:value={editingName}
                  class="edit-input"
                  onkeydown={handleEditKeydown}
                  onblur={handleEditSubmit}
                  use:focus
                />
              {:else}
                <span
                  class="commitment-name"
                  role="button"
                  tabindex="0"
                  ondblclick={() => !isProjectOwned(commitment) && startEditing(commitment)}
                  use:truncateTooltip
                >
                  {commitment.name}
                </span>
              {/if}

              {#if !isProjectOwned(commitment)}
                <button
                  class="delete-btn"
                  onclick={() => onDelete(commitment.id)}
                  aria-label="Delete commitment"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              {/if}
            </div>
          {:else}
            <div class="empty-section">
              {#if section.key === 'projects'}
                No projects yet
              {:else}
                No commitments yet
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</Modal>

<style>
  .commitments-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .section-title {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }

  .section-hint {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    opacity: 0.6;
    font-style: italic;
  }

  .projects-section {
    padding-top: 1rem;
    border-top: 1px solid rgba(108, 92, 231, 0.1);
  }

  .add-section-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    background: rgba(108, 92, 231, 0.15);
    border: 1px solid rgba(108, 92, 231, 0.25);
    color: var(--color-primary-light);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
  }

  .add-section-btn:hover {
    background: var(--gradient-primary);
    border-color: transparent;
    color: white;
    transform: scale(1.1);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .add-form {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.5rem;
    background: rgba(15, 15, 30, 0.6);
    border-radius: var(--radius-lg);
    border: 1px solid rgba(108, 92, 231, 0.2);
  }

  .add-input,
  .edit-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: rgba(10, 10, 20, 0.8);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-size: 0.875rem;
  }

  .add-input:focus,
  .edit-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 15px var(--color-primary-glow);
  }

  .confirm-btn,
  .cancel-btn {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s var(--ease-spring);
    border: none;
  }

  .confirm-btn {
    background: var(--color-green);
    color: white;
  }

  .confirm-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .confirm-btn:not(:disabled):hover {
    transform: scale(1.1);
    box-shadow: 0 0 15px rgba(38, 222, 129, 0.4);
  }

  .cancel-btn {
    background: rgba(255, 107, 107, 0.2);
    color: var(--color-red);
  }

  .cancel-btn:hover {
    background: rgba(255, 107, 107, 0.3);
    transform: scale(1.1);
  }

  .items-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .commitment-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    background: rgba(15, 15, 30, 0.8);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-lg);
    transition: all 0.25s var(--ease-out);
  }

  .commitment-item:hover {
    border-color: rgba(108, 92, 231, 0.3);
    background: rgba(20, 20, 40, 0.9);
  }

  .commitment-item.dragging {
    opacity: 0.5;
    transform: scale(1.02);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    z-index: 10;
  }

  /* Drop indicator line above */
  .commitment-item.drop-above::before {
    content: '';
    position: absolute;
    top: -5px;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--gradient-primary);
    border-radius: var(--radius-full);
    box-shadow:
      0 0 15px var(--color-primary-glow),
      0 0 30px rgba(108, 92, 231, 0.3);
    animation: dropPulse 1s var(--ease-smooth) infinite;
  }

  /* Drop indicator line below */
  .commitment-item.drop-below::after {
    content: '';
    position: absolute;
    bottom: -5px;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--gradient-primary);
    border-radius: var(--radius-full);
    box-shadow:
      0 0 15px var(--color-primary-glow),
      0 0 30px rgba(108, 92, 231, 0.3);
    animation: dropPulse 1s var(--ease-smooth) infinite;
  }

  @keyframes dropPulse {
    0%,
    100% {
      opacity: 1;
      box-shadow:
        0 0 15px var(--color-primary-glow),
        0 0 30px rgba(108, 92, 231, 0.3);
    }
    50% {
      opacity: 0.8;
      box-shadow:
        0 0 20px var(--color-primary-glow),
        0 0 40px rgba(108, 92, 231, 0.4);
    }
  }

  .drag-handle-icon {
    opacity: 0.3;
    transition: opacity 0.2s;
    color: var(--color-text-muted);
    cursor: grab;
    touch-action: none;
    user-select: none;
    padding: 0.25rem;
    -webkit-user-select: none;
  }

  .drag-handle-icon:active {
    cursor: grabbing;
    opacity: 0.8;
  }

  .commitment-item:hover .drag-handle-icon {
    opacity: 0.7;
  }

  /* On mobile, keep handles visible so users know they can drag */
  @media (max-width: 640px) {
    .drag-handle-icon {
      opacity: 0.5;
      padding: 0.375rem;
    }

    .delete-btn {
      opacity: 0.4 !important;
    }
  }

  .commitment-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.875rem;
    cursor: text;
  }

  .edit-input {
    flex: 1;
    min-width: 0;
  }

  .delete-btn {
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: all 0.3s var(--ease-spring);
    border: none;
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .commitment-item:hover .delete-btn {
    opacity: 0.5;
  }

  .delete-btn:hover {
    opacity: 1 !important;
    color: var(--color-red);
    background: rgba(255, 107, 107, 0.2);
  }

  .empty-section {
    padding: 1rem;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    font-style: italic;
    opacity: 0.6;
  }

  .commitment-item.project-owned {
    cursor: default;
    border-color: rgba(255, 215, 0, 0.15);
    background: rgba(255, 215, 0, 0.03);
  }

  .commitment-item.project-owned:hover {
    border-color: rgba(255, 215, 0, 0.25);
    background: rgba(255, 215, 0, 0.05);
  }

  .project-icon {
    color: #ffd700;
    opacity: 0.7;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
