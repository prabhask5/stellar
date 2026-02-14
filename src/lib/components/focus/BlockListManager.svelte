<script lang="ts">
  /**
   * @fileoverview Collapsible manager panel for website block lists.
   *
   * Provides a high-level list view of all block lists belonging to a user.
   * Each list item shows:
   * - A toggle switch to enable/disable the list
   * - The list name and active-days summary
   * - A clickable area that navigates to the per-list editor page
   * - A delete button with confirmation
   *
   * The panel is expandable — a top-level "Block Lists" button toggles the
   * inner panel's visibility. A badge shows the count of lists active today.
   *
   * An "Extension Required" banner reminds users to install the Stellar Focus
   * browser extension, which performs the actual website blocking.
   *
   * Creates new block lists via a modal containing `BlockListForm`.
   */

  import { goto } from '$app/navigation';
  import type { DayOfWeek } from '$lib/types';
  import { blockListStore, blockedWebsitesStore } from '$lib/stores/focus';
  import Modal from '$lib/components/Modal.svelte';
  import BlockListForm from './BlockListForm.svelte';
  import { remoteChangeAnimation, triggerLocalAnimation } from '@prabhask5/stellar-engine/actions';
  import { truncateTooltip } from '@prabhask5/stellar-engine/actions';

  // =============================================================================
  //  Props Interface
  // =============================================================================

  interface Props {
    /** Authenticated user's ID — used to load block lists from the store */
    userId: string;
  }

  let { userId }: Props = $props();

  // =============================================================================
  //  DOM Element Tracking
  // =============================================================================

  /** Map of list-item DOM nodes keyed by block list ID — for local animations */
  // Track element references by list id for local animations
  let listElements: Record<string, HTMLElement> = {};

  /**
   * Svelte action that registers a list-item DOM node for animation targeting.
   * Automatically cleans up when the element is destroyed.
   *
   * @param node - The DOM element to register
   * @param id - Block list ID associated with this element
   * @returns Svelte action lifecycle object with `destroy` callback
   */
  function registerListElement(node: HTMLElement, id: string) {
    listElements[id] = node;
    return {
      destroy() {
        delete listElements[id];
      }
    };
  }

  // =============================================================================
  //  Constants
  // =============================================================================

  /** Day-of-week metadata for formatting active-days labels */
  // Day labels for display
  const dayLabels: { short: string; full: string; value: DayOfWeek }[] = [
    { short: 'S', full: 'Sun', value: 0 },
    { short: 'M', full: 'Mon', value: 1 },
    { short: 'T', full: 'Tue', value: 2 },
    { short: 'W', full: 'Wed', value: 3 },
    { short: 'T', full: 'Thu', value: 4 },
    { short: 'F', full: 'Fri', value: 5 },
    { short: 'S', full: 'Sat', value: 6 }
  ];

  // =============================================================================
  //  Local State
  // =============================================================================

  /** Whether the block-lists panel is expanded */
  // Local state
  let isOpen = $state(false);
  /** ID of the block list currently being edited — `null` when not editing */
  let editingListId = $state<string | null>(null);
  /** Whether the "Create Block List" modal is visible */
  let showCreateModal = $state(false);

  // =============================================================================
  //  Data Loading Effects
  // =============================================================================

  /** Loads all block lists for the authenticated user whenever `userId` changes */
  // Load block lists on mount
  $effect(() => {
    if (userId) {
      blockListStore.load(userId);
    }
  });

  /** Loads blocked websites for the list being edited */
  // Load websites when editing a list
  $effect(() => {
    if (editingListId) {
      blockedWebsitesStore.load(editingListId);
    }
  });

  // =============================================================================
  //  Actions
  // =============================================================================

  /**
   * Creates a new block list and optionally sets active days.
   * Closes the create modal on success.
   *
   * @param data - Form data containing the list name and active days
   */
  async function createList(data: { name: string; activeDays: DayOfWeek[] | null }) {
    const newList = await blockListStore.create(data.name);
    if (newList && data.activeDays !== null) {
      // Update with active_days if not all days
      await blockListStore.update(newList.id, { active_days: data.activeDays });
    }
    showCreateModal = false;
  }

  /**
   * Converts an `active_days` array to a human-readable label.
   *
   * @param activeDays - Array of day indices, or `null` for every day
   * @returns Display string — "Every day", "Weekdays", "Weekends", or concatenated short labels
   */
  function getActiveDaysLabel(activeDays: DayOfWeek[] | null): string {
    if (activeDays === null) return 'Every day';
    if (activeDays.length === 5 && !activeDays.includes(0) && !activeDays.includes(6)) {
      return 'Weekdays';
    }
    if (activeDays.length === 2 && activeDays.includes(0) && activeDays.includes(6)) {
      return 'Weekends';
    }
    return activeDays.map((d) => dayLabels[d].short).join('');
  }

  /**
   * Deletes a block list after user confirmation.
   * Clears `editingListId` if the deleted list was being edited.
   *
   * @param id - Block list ID to delete
   */
  async function deleteList(id: string) {
    if (!confirm('Delete this block list? All blocked websites in it will be removed.')) return;
    await blockListStore.delete(id);
    if (editingListId === id) {
      editingListId = null;
    }
  }

  /**
   * Toggles the enabled/disabled state of a block list.
   * Also fires a local animation on the list-item element.
   *
   * @param id - Block list ID to toggle
   */
  async function toggleList(id: string) {
    const element = listElements[id];
    if (element) {
      triggerLocalAnimation(element, 'toggle');
    }
    await blockListStore.toggle(id);
  }

  /**
   * Navigates to the dedicated block-list editor page.
   *
   * @param listId - Block list ID to open for editing
   */
  function openEditor(listId: string) {
    goto(`/focus/block-lists/${listId}`);
  }

  // =============================================================================
  //  Derived State
  // =============================================================================

  /**
   * Checks whether a block list is active on the current day of the week.
   *
   * @param list - Object with `is_enabled` and `active_days` fields
   * @returns `true` if the list is enabled and covers today
   */
  // Helper to check if a block list is active today
  function isBlockListActiveToday(list: {
    is_enabled: boolean;
    active_days: DayOfWeek[] | null;
  }): boolean {
    if (!list.is_enabled) return false;
    if (list.active_days === null) return true; // null means every day
    const currentDay = new Date().getDay() as DayOfWeek;
    return list.active_days.includes(currentDay);
  }

  /** Count of block lists that are enabled and active on today's day-of-week */
  // Derived count of active block lists
  const activeBlockListCount = $derived($blockListStore.filter(isBlockListActiveToday).length);
</script>

<!-- ═══ Block List Manager ═══ -->
<div class="block-list-manager">
  <!-- Collapsible toggle header — shows list icon, label, active count badge, chevron -->
  <button class="manager-toggle" onclick={() => (isOpen = !isOpen)}>
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      width="18"
      height="18"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
    <span>Block Lists</span>
    <span class="badge">{activeBlockListCount}</span>
    <svg
      class="chevron"
      class:open={isOpen}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      width="16"
      height="16"
    >
      <polyline points="6,9 12,15 18,9" />
    </svg>
  </button>

  <!-- ═══ Expandable Panel ═══ -->
  {#if isOpen}
    <div class="panel">
      <!-- Extension requirement banner — links to the Stellar Focus browser extension -->
      <div class="extension-banner">
        <div class="banner-icon">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            width="24"
            height="24"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div class="banner-content">
          <span class="banner-title">Browser Extension Required</span>
          <span class="banner-desc">Website blocking requires the Stellar Focus extension</span>
        </div>
        <a
          href="https://github.com/prabhask5/stellar/tree/main/stellar-focus"
          target="_blank"
          rel="noopener"
          class="banner-btn"
        >
          Get Extension
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            width="14"
            height="14"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>

      <!-- ═══ Block Lists ═══ -->
      <div class="list-view">
        <!-- Create button — opens the modal form -->
        <button class="create-btn" onclick={() => (showCreateModal = true)}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            width="18"
            height="18"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Create Block List</span>
        </button>

        <div class="lists">
          {#each $blockListStore as list (list.id)}
            <!-- Individual block list row -->
            <div
              class="list-item"
              use:registerListElement={list.id}
              use:remoteChangeAnimation={{ entityId: list.id, entityType: 'block_lists' }}
            >
              <!-- Enable / disable toggle switch -->
              <button
                class="toggle-btn"
                class:active={list.is_enabled}
                onclick={() => toggleList(list.id)}
                aria-checked={list.is_enabled}
                aria-label={list.is_enabled ? `Disable ${list.name}` : `Enable ${list.name}`}
                role="switch"
              >
                <span class="toggle-knob"></span>
              </button>

              <!-- Clickable info area — navigates to the editor page -->
              <button
                class="list-info"
                onclick={() => openEditor(list.id)}
                aria-label={`Edit ${list.name}`}
              >
                <div class="list-details">
                  <span class="list-name" use:truncateTooltip>{list.name}</span>
                  <span class="list-days" use:truncateTooltip
                    >{getActiveDaysLabel(list.active_days)}</span
                  >
                </div>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  width="16"
                  height="16"
                  aria-hidden="true"
                >
                  <polyline points="9,18 15,12 9,6" />
                </svg>
              </button>

              <!-- Delete button -->
              <button
                class="delete-btn"
                onclick={() => deleteList(list.id)}
                aria-label={`Delete ${list.name}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  width="16"
                  height="16"
                  aria-hidden="true"
                >
                  <polyline points="3,6 5,6 21,6" />
                  <path
                    d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"
                  />
                </svg>
              </button>
            </div>
          {:else}
            <!-- Empty state — no block lists created yet -->
            <p class="empty-text">
              No block lists yet. Create one to block distracting websites during focus sessions.
            </p>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- ═══ Create Block List Modal ═══ -->
<Modal open={showCreateModal} title="Create Block List" onClose={() => (showCreateModal = false)}>
  <BlockListForm onSubmit={createList} onCancel={() => (showCreateModal = false)} />
</Modal>

<style>
  /* ═══ Manager Container ═══ */

  .block-list-manager {
    margin-top: 1.5rem;
  }

  /* ═══ Toggle Header Button ═══ */

  .manager-toggle {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 1rem 1.25rem;
    background: rgba(15, 15, 26, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-xl);
    color: var(--color-text);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
  }

  .manager-toggle:hover {
    border-color: rgba(108, 92, 231, 0.3);
    background: rgba(108, 92, 231, 0.1);
  }

  /* Active-count badge — pushed to the right via margin-left: auto */
  .badge {
    margin-left: auto;
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
    background: var(--gradient-primary);
    border-radius: var(--radius-full);
    color: white;
  }

  /* Chevron icon — rotates 180deg when panel is open */
  .chevron {
    transition: transform 0.3s;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  /* ═══ Expandable Panel ═══ */

  .panel {
    margin-top: 0.5rem;
    padding: 1rem;
    background: rgba(15, 15, 26, 0.6);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-xl);
    animation: slideDown 0.2s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ═══ Create Button ═══ */

  .create-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    background: rgba(108, 92, 231, 0.15);
    border: 1px dashed rgba(108, 92, 231, 0.3); /* dashed border signals "add new" */
    border-radius: var(--radius-lg);
    color: var(--color-primary-light);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .create-btn:hover {
    background: rgba(108, 92, 231, 0.25);
    border-color: rgba(108, 92, 231, 0.5);
  }

  /* ═══ List Items ═══ */

  .lists {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .list-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-lg);
  }

  /* ═══ Toggle Switch ═══ */

  .toggle-btn {
    position: relative;
    width: 40px;
    height: 24px;
    border-radius: 12px;
    background: rgba(108, 92, 231, 0.2);
    border: 1px solid rgba(108, 92, 231, 0.3);
    cursor: pointer;
    transition: all 0.3s;
    flex-shrink: 0;
  }

  .toggle-btn.active {
    background: var(--gradient-primary);
    border-color: transparent;
  }

  .toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    transition: transform 0.3s var(--ease-spring);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  /* Slide knob to the right when active */
  .toggle-btn.active .toggle-knob {
    transform: translateX(16px);
  }

  /* ═══ List Info (Clickable Area) ═══ */

  .list-info {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: none;
    border: none;
    padding: 0.25rem 0;
    color: var(--color-text);
    cursor: pointer;
    text-align: left;
  }

  .list-details {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .list-name {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .list-days {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  /* ═══ Delete Button ═══ */

  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: none;
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }

  .delete-btn:hover {
    background: rgba(255, 107, 107, 0.15);
    color: var(--color-red);
  }

  /* ═══ Empty State ═══ */

  .empty-text {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    text-align: center;
    padding: 1rem;
    margin: 0;
  }

  /* ═══ Extension Banner ═══ */

  .extension-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    margin-bottom: 1rem;
    background: linear-gradient(135deg, rgba(108, 92, 231, 0.15) 0%, rgba(255, 121, 198, 0.1) 100%);
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: var(--radius-lg);
    animation: fadeInDown 0.3s ease-out;
  }

  @keyframes fadeInDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .banner-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
    border-radius: var(--radius-md);
    color: white;
    box-shadow: 0 4px 12px var(--color-primary-glow);
  }

  .banner-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0; /* allow text truncation */
  }

  .banner-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .banner-desc {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    line-height: 1.3;
  }

  .banner-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
    text-decoration: none;
    background: var(--gradient-primary);
    border: none;
    border-radius: var(--radius-full);
    color: white;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px var(--color-primary-glow);
  }

  .banner-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px var(--color-primary-glow);
  }

  .banner-btn:active {
    transform: translateY(0);
  }

  /* ═══ Responsive — Tablet ═══ */

  @media (min-width: 641px) and (max-width: 900px) {
    .toggle-btn {
      width: 36px;
      height: 22px;
    }

    .toggle-knob {
      width: 16px;
      height: 16px;
    }

    .toggle-btn.active .toggle-knob {
      transform: translateX(14px);
    }
  }
</style>
