<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { goalListsStore, projectsStore } from '$lib/stores/data';
  import type { GoalListWithProgress, ProjectWithDetails } from '$lib/types';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import ProjectCard from '$lib/components/ProjectCard.svelte';
  import DraggableList from '$lib/components/DraggableList.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { remoteChangeAnimation } from '@prabhask5/stellar-engine/actions';
  import { truncateTooltip } from '$lib/actions/truncateTooltip';

  let error = $state<string | null>(null);
  let showCreateListModal = $state(false);
  let showCreateProjectModal = $state(false);
  let newListName = $state('');
  let newProjectName = $state('');
  let creatingList = $state(false);
  let creatingProject = $state(false);

  // Focus action for accessibility (skip on mobile to avoid keyboard popup)
  function focus(node: HTMLElement) {
    if (window.innerWidth > 640) {
      node.focus();
    }
  }

  // Subscribe to stores
  let lists = $state<GoalListWithProgress[]>([]);
  let projects = $state<ProjectWithDetails[]>([]);
  let loadingLists = $state(true);
  let loadingProjects = $state(true);

  // Filter goal lists to exclude project-owned ones
  const standaloneLists = $derived(lists.filter((l) => !l.project_id));
  const currentProject = $derived(projects.find((p) => p.is_current) || null);
  const totalProjectsProgress = $derived(
    projects.length > 0
      ? Math.round(
          projects.reduce(
            (sum, p) => sum + Math.min(100, p.goalList?.completionPercentage ?? 0),
            0
          ) / projects.length
        )
      : 0
  );

  $effect(() => {
    const unsubLists = goalListsStore.subscribe((value) => {
      lists = value;
    });
    const unsubLoadingLists = goalListsStore.loading.subscribe((value) => {
      loadingLists = value;
    });
    const unsubProjects = projectsStore.subscribe((value) => {
      projects = value;
    });
    const unsubLoadingProjects = projectsStore.loading.subscribe((value) => {
      loadingProjects = value;
    });

    return () => {
      unsubLists();
      unsubLoadingLists();
      unsubProjects();
      unsubLoadingProjects();
    };
  });

  onMount(async () => {
    await Promise.all([goalListsStore.load(), projectsStore.load()]);
  });

  async function handleCreateList(event: Event) {
    event.preventDefault();
    if (!newListName.trim() || creatingList) return;

    try {
      creatingList = true;
      const session = $page.data.session;
      if (!session?.user?.id) {
        error = 'Not authenticated';
        return;
      }
      await goalListsStore.create(newListName.trim(), session.user.id);
      newListName = '';
      showCreateListModal = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create list';
    } finally {
      creatingList = false;
    }
  }

  async function handleCreateProject(event: Event) {
    event.preventDefault();
    if (!newProjectName.trim() || creatingProject) return;

    try {
      creatingProject = true;
      const session = $page.data.session;
      if (!session?.user?.id) {
        error = 'Not authenticated';
        return;
      }
      await projectsStore.create(newProjectName.trim(), session.user.id);
      newProjectName = '';
      showCreateProjectModal = false;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create project';
    } finally {
      creatingProject = false;
    }
  }

  async function handleDeleteList(id: string) {
    if (!confirm('Are you sure you want to delete this list and all its goals?')) return;

    try {
      await goalListsStore.delete(id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete list';
    }
  }

  async function handleDeleteProject(id: string) {
    const confirmed = confirm(
      'Are you sure you want to delete this project? This will also delete:\n\n' +
        "- The project's goal list and all its goals\n" +
        "- The project's tag (tasks using this tag will become untagged)\n" +
        "- The project's commitment"
    );
    if (!confirmed) return;

    try {
      await projectsStore.delete(id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete project';
    }
  }

  async function handleSetCurrentProject(id: string) {
    try {
      // Toggle off if clicking the already-current project
      if (currentProject?.id === id) {
        const session = $page.data.session;
        if (session?.user?.id) {
          await projectsStore.clearCurrent(session.user.id);
        }
      } else {
        await projectsStore.setCurrent(id);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to set current project';
    }
  }

  async function handleReorderProject(itemId: string, newOrder: number) {
    await projectsStore.reorder(itemId, newOrder);
  }

  async function handleReorderGoalList(itemId: string, newOrder: number) {
    await goalListsStore.reorder(itemId, newOrder);
  }

  function navigateToList(id: string) {
    goto(`/plans/${id}`);
  }
</script>

<svelte:head>
  <title>Plans - Stellar Planner</title>
</svelte:head>

<div class="container">
  {#if error}
    <div class="error-banner">
      <p>{error}</p>
      <button onclick={() => (error = null)}>Dismiss</button>
    </div>
  {/if}

  <!-- Projects Section -->
  <section class="section">
    <header class="section-header">
      <h2>Projects</h2>
      <button class="btn btn-primary" onclick={() => (showCreateProjectModal = true)}>
        + New Project
      </button>
    </header>

    {#if !loadingProjects}
      <div class="total-progress">
        {#if projects.length > 0}
          <div class="total-progress-label">
            <span class="total-progress-text">Total Project Progress</span>
            <span class="total-progress-stat">{totalProjectsProgress}%</span>
          </div>
          <ProgressBar percentage={totalProjectsProgress} showLabel={false} height="8px" />
        {:else}
          <div class="total-progress-label">
            <span class="total-progress-text">Total Progress</span>
            <span class="total-progress-stat">—</span>
          </div>
          <div class="total-progress-bar-empty"></div>
        {/if}
      </div>
    {/if}

    {#if currentProject}
      <button
        class="current-project-banner"
        onclick={() => currentProject.goal_list_id && navigateToList(currentProject.goal_list_id)}
      >
        <!-- Animated star layers -->
        <span class="banner-stars banner-stars-1"></span>
        <span class="banner-stars banner-stars-2"></span>

        <!-- Nebula blobs -->
        <span class="banner-nebula banner-nebula-1"></span>
        <span class="banner-nebula banner-nebula-2"></span>

        <!-- Shimmer sweep -->
        <span class="banner-shimmer"></span>

        <!-- Content -->
        <span class="banner-content">
          <span class="banner-star-icon">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="18" height="18">
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              />
            </svg>
          </span>
          <span class="banner-text">
            <span class="banner-label">Current Project</span>
            <span class="banner-name" use:truncateTooltip>{currentProject.name}</span>
          </span>
          <span class="banner-arrow">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              width="16"
              height="16"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
        </span>
      </button>
    {:else}
      <div class="current-project-banner empty">
        <span class="banner-content">
          <span class="banner-star-icon empty-icon">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="18" height="18">
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              />
            </svg>
          </span>
          <span class="banner-text">
            <span class="banner-label empty-label">Current Project</span>
            <span class="banner-name empty-name">None selected</span>
          </span>
        </span>
      </div>
    {/if}

    {#if loadingProjects}
      <div class="lists-grid">
        {#each Array(2) as _, i (i)}
          <div class="skeleton-card" style="--delay: {i * 0.15}s">
            <div class="skeleton-header">
              <div class="skeleton-title"></div>
              <div class="skeleton-btn"></div>
            </div>
            <div class="skeleton-stats"></div>
            <div class="skeleton-progress"></div>
            <div class="skeleton-shimmer"></div>
          </div>
        {/each}
      </div>
    {:else if projects.length === 0}
      <EmptyState
        icon="🚀"
        title="No projects yet"
        description="Create a project to manage tasks and goals collectively"
      >
        <button class="btn btn-primary" onclick={() => (showCreateProjectModal = true)}>
          Create First Project
        </button>
      </EmptyState>
    {:else}
      <DraggableList items={projects} onReorder={handleReorderProject}>
        {#snippet renderItem({ item: project, dragHandleProps })}
          <ProjectCard
            {project}
            {dragHandleProps}
            onNavigate={navigateToList}
            onSetCurrent={handleSetCurrentProject}
            onDelete={handleDeleteProject}
          />
        {/snippet}
      </DraggableList>
    {/if}
  </section>

  <!-- Goal Lists Section -->
  <section class="section">
    <header class="section-header">
      <h2>Goal Lists</h2>
      <button class="btn btn-primary" onclick={() => (showCreateListModal = true)}>
        + New List
      </button>
    </header>

    {#if loadingLists}
      <div class="lists-grid">
        {#each Array(3) as _, i (i)}
          <div class="skeleton-card" style="--delay: {i * 0.15}s">
            <div class="skeleton-header">
              <div class="skeleton-title"></div>
              <div class="skeleton-btn"></div>
            </div>
            <div class="skeleton-stats"></div>
            <div class="skeleton-progress"></div>
            <div class="skeleton-shimmer"></div>
          </div>
        {/each}
      </div>
    {:else if standaloneLists.length === 0}
      <EmptyState
        icon="📝"
        title="No goal lists yet"
        description="Create a goal list to track general goals"
      >
        <button class="btn btn-primary" onclick={() => (showCreateListModal = true)}>
          Create First List
        </button>
      </EmptyState>
    {:else}
      <DraggableList items={standaloneLists} onReorder={handleReorderGoalList}>
        {#snippet renderItem({ item: list, dragHandleProps })}
          <div
            class="list-card has-drag-handle"
            role="button"
            tabindex="0"
            onclick={() => navigateToList(list.id)}
            onkeypress={(e) => e.key === 'Enter' && navigateToList(list.id)}
            use:remoteChangeAnimation={{ entityId: list.id, entityType: 'goal_lists' }}
          >
            <button
              class="drag-handle card-drag-handle"
              {...dragHandleProps}
              aria-label="Drag to reorder">⋮⋮</button
            >
            <div class="list-header">
              <h3 class="list-name" use:truncateTooltip>{list.name}</h3>
              <button
                class="delete-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  handleDeleteList(list.id);
                }}
                aria-label="Delete list"
              >
                ×
              </button>
            </div>
            <div class="list-stats">
              <span class="stat-text">
                {list.completedGoals} / {list.totalGoals} goals
              </span>
            </div>
            <ProgressBar percentage={list.completionPercentage} />
          </div>
        {/snippet}
      </DraggableList>
    {/if}
  </section>
</div>

<!-- Create List Modal -->
<Modal
  open={showCreateListModal}
  title="Create New List"
  onClose={() => (showCreateListModal = false)}
>
  <form class="create-form" onsubmit={handleCreateList}>
    <div class="form-group">
      <label for="list-name">List Name</label>
      <input
        id="list-name"
        type="text"
        bind:value={newListName}
        placeholder="Enter list name..."
        required
        use:focus
      />
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick={() => (showCreateListModal = false)}>
        Cancel
      </button>
      <button type="submit" class="btn btn-primary" disabled={creatingList}>
        {creatingList ? 'Creating...' : 'Create List'}
      </button>
    </div>
  </form>
</Modal>

<!-- Create Project Modal -->
<Modal
  open={showCreateProjectModal}
  title="Create New Project"
  onClose={() => (showCreateProjectModal = false)}
>
  <form class="create-form" onsubmit={handleCreateProject}>
    <div class="form-group">
      <label for="project-name">Project Name</label>
      <input
        id="project-name"
        type="text"
        bind:value={newProjectName}
        placeholder="Enter project name..."
        required
        use:focus
      />
    </div>
    <p class="form-hint">
      Creating a project will also add a commitment and a long term task tag for you to manage
      associated tasks.
    </p>
    <div class="form-actions">
      <button
        type="button"
        class="btn btn-secondary"
        onclick={() => (showCreateProjectModal = false)}
      >
        Cancel
      </button>
      <button type="submit" class="btn btn-primary" disabled={creatingProject}>
        {creatingProject ? 'Creating...' : 'Create Project'}
      </button>
    </div>
  </form>
</Modal>

<style>
  .section {
    margin-bottom: 3rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }

  .section-header h2 {
    font-size: 1.75rem;
    font-weight: 800;
    background: linear-gradient(
      135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-text) 100%
    );
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: -0.03em;
    animation: textShimmer 8s linear infinite;
  }

  @keyframes textShimmer {
    0% {
      background-position: 0% center;
    }
    100% {
      background-position: 200% center;
    }
  }

  /* ── Current Project Banner (maximalist space theme) ── */

  .current-project-banner {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    margin-bottom: 1.5rem;
    padding: 1rem 1.25rem;
    border-radius: var(--radius-xl);
    border: 1px solid rgba(255, 215, 0, 0.25);
    background: linear-gradient(
      135deg,
      rgba(15, 10, 40, 0.95) 0%,
      rgba(30, 20, 70, 0.9) 40%,
      rgba(20, 12, 50, 0.95) 100%
    );
    overflow: hidden;
    cursor: pointer;
    transition: all 0.4s var(--ease-out);
    box-shadow:
      0 0 20px rgba(255, 215, 0, 0.08),
      0 4px 24px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(255, 215, 0, 0.1);
    text-align: left;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
  }

  .current-project-banner:hover {
    border-color: rgba(255, 215, 0, 0.45);
    box-shadow:
      0 0 35px rgba(255, 215, 0, 0.15),
      0 8px 32px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 215, 0, 0.15);
    transform: translateY(-1px);
  }

  .current-project-banner:active {
    transform: translateY(0);
  }

  /* Tiny twinkling stars - layer 1 (slow) */
  .banner-stars {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .banner-stars-1 {
    background-image:
      radial-gradient(1px 1px at 10% 20%, rgba(255, 255, 255, 0.7) 0%, transparent 100%),
      radial-gradient(1px 1px at 30% 70%, rgba(255, 255, 255, 0.5) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 55% 15%, rgba(255, 215, 0, 0.8) 0%, transparent 100%),
      radial-gradient(1px 1px at 75% 55%, rgba(255, 255, 255, 0.6) 0%, transparent 100%),
      radial-gradient(1px 1px at 90% 30%, rgba(255, 255, 255, 0.4) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 20% 85%, rgba(255, 215, 0, 0.6) 0%, transparent 100%),
      radial-gradient(1px 1px at 65% 90%, rgba(255, 255, 255, 0.5) 0%, transparent 100%),
      radial-gradient(1px 1px at 85% 80%, rgba(255, 255, 255, 0.3) 0%, transparent 100%);
    animation: bannerTwinkle1 4s ease-in-out infinite alternate;
  }

  .banner-stars-2 {
    background-image:
      radial-gradient(1px 1px at 15% 45%, rgba(255, 255, 255, 0.5) 0%, transparent 100%),
      radial-gradient(1px 1px at 40% 30%, rgba(255, 255, 255, 0.4) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 70% 40%, rgba(255, 215, 0, 0.7) 0%, transparent 100%),
      radial-gradient(1px 1px at 50% 60%, rgba(255, 255, 255, 0.6) 0%, transparent 100%),
      radial-gradient(1px 1px at 95% 15%, rgba(255, 255, 255, 0.5) 0%, transparent 100%),
      radial-gradient(1px 1px at 5% 60%, rgba(255, 255, 255, 0.3) 0%, transparent 100%);
    animation: bannerTwinkle2 5s ease-in-out infinite alternate;
  }

  @keyframes bannerTwinkle1 {
    0% {
      opacity: 0.6;
    }
    100% {
      opacity: 1;
    }
  }

  @keyframes bannerTwinkle2 {
    0% {
      opacity: 1;
    }
    100% {
      opacity: 0.5;
    }
  }

  /* Nebula blobs */
  .banner-nebula {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    filter: blur(25px);
  }

  .banner-nebula-1 {
    width: 120px;
    height: 60px;
    top: -15px;
    left: 10%;
    background: radial-gradient(ellipse, rgba(108, 92, 231, 0.3) 0%, transparent 70%);
    animation: nebulaFloat1 8s ease-in-out infinite alternate;
  }

  .banner-nebula-2 {
    width: 100px;
    height: 50px;
    bottom: -10px;
    right: 15%;
    background: radial-gradient(ellipse, rgba(255, 215, 0, 0.15) 0%, transparent 70%);
    animation: nebulaFloat2 10s ease-in-out infinite alternate;
  }

  @keyframes nebulaFloat1 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.5;
    }
    100% {
      transform: translate(15px, 5px) scale(1.15);
      opacity: 0.8;
    }
  }

  @keyframes nebulaFloat2 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.4;
    }
    100% {
      transform: translate(-10px, -3px) scale(1.1);
      opacity: 0.7;
    }
  }

  /* Shimmer sweep */
  .banner-shimmer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      105deg,
      transparent 40%,
      rgba(255, 215, 0, 0.06) 45%,
      rgba(255, 215, 0, 0.12) 50%,
      rgba(255, 215, 0, 0.06) 55%,
      transparent 60%
    );
    background-size: 200% 100%;
    animation: bannerShimmerSweep 6s ease-in-out infinite;
  }

  @keyframes bannerShimmerSweep {
    0%,
    100% {
      background-position: 200% center;
    }
    50% {
      background-position: -200% center;
    }
  }

  /* Content layout */
  .banner-content {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
  }

  .banner-star-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    color: #ffd700;
    background: radial-gradient(circle, rgba(255, 215, 0, 0.2) 0%, transparent 70%);
    animation: bannerStarPulse 3s ease-in-out infinite;
    filter: drop-shadow(0 0 6px rgba(255, 215, 0, 0.5));
  }

  @keyframes bannerStarPulse {
    0%,
    100% {
      filter: drop-shadow(0 0 6px rgba(255, 215, 0, 0.5));
      transform: scale(1);
    }
    50% {
      filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.8));
      transform: scale(1.08);
    }
  }

  .banner-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    flex: 1;
  }

  .banner-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(255, 215, 0, 0.6);
  }

  .banner-name {
    font-size: 1rem;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
  }

  .banner-arrow {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    color: rgba(255, 215, 0, 0.5);
    transition: all 0.3s var(--ease-out);
  }

  .current-project-banner:hover .banner-arrow {
    color: rgba(255, 215, 0, 0.9);
    transform: translateX(3px);
  }

  /* ── Empty state (no current project) ── */

  .current-project-banner.empty {
    cursor: default;
    background: linear-gradient(
      135deg,
      rgba(15, 10, 40, 0.7) 0%,
      rgba(25, 18, 55, 0.6) 40%,
      rgba(18, 11, 42, 0.7) 100%
    );
    border-color: rgba(108, 92, 231, 0.15);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.25),
      inset 0 1px 0 rgba(108, 92, 231, 0.08);
  }

  .current-project-banner.empty:hover {
    transform: none;
    border-color: rgba(108, 92, 231, 0.15);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.25),
      inset 0 1px 0 rgba(108, 92, 231, 0.08);
  }

  .empty-icon {
    color: rgba(108, 92, 231, 0.4);
    background: radial-gradient(circle, rgba(108, 92, 231, 0.1) 0%, transparent 70%);
    filter: none;
    animation: none;
  }

  .empty-label {
    color: rgba(108, 92, 231, 0.4);
  }

  .empty-name {
    color: var(--color-text-muted);
    opacity: 0.5;
    text-shadow: none;
  }

  .error-banner {
    background: linear-gradient(
      135deg,
      rgba(255, 107, 107, 0.18) 0%,
      rgba(255, 107, 107, 0.06) 100%
    );
    border: 1px solid rgba(255, 107, 107, 0.4);
    border-radius: var(--radius-xl);
    padding: 1.25rem 1.5rem;
    margin-bottom: 2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    backdrop-filter: blur(16px);
    box-shadow: 0 0 30px rgba(255, 107, 107, 0.1);
  }

  .error-banner button {
    color: var(--color-red);
    font-weight: 600;
    padding: 0.375rem 1rem;
    border-radius: var(--radius-lg);
    transition: all 0.25s var(--ease-spring);
  }

  .error-banner button:hover {
    background: rgba(255, 107, 107, 0.25);
    transform: scale(1.05);
  }

  /* Skeleton Loading Cards */
  .skeleton-card {
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-2xl);
    padding: 1.75rem;
    position: relative;
    overflow: hidden;
    animation: skeletonPulse 2s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  .skeleton-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 15%;
    right: 15%;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(108, 92, 231, 0.2),
      rgba(255, 255, 255, 0.1),
      rgba(108, 92, 231, 0.2),
      transparent
    );
  }

  @keyframes skeletonPulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }

  .skeleton-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.25rem;
  }

  .skeleton-title {
    height: 1.375rem;
    width: 65%;
    background: linear-gradient(
      90deg,
      rgba(108, 92, 231, 0.15) 0%,
      rgba(108, 92, 231, 0.25) 50%,
      rgba(108, 92, 231, 0.15) 100%
    );
    border-radius: var(--radius-md);
  }

  .skeleton-btn {
    width: 36px;
    height: 36px;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-lg);
  }

  .skeleton-stats {
    height: 0.9375rem;
    width: 40%;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-sm);
    margin-bottom: 1.25rem;
  }

  .skeleton-progress {
    height: 8px;
    width: 100%;
    background: rgba(108, 92, 231, 0.1);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .skeleton-shimmer {
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(108, 92, 231, 0.08) 20%,
      rgba(255, 255, 255, 0.05) 40%,
      rgba(108, 92, 231, 0.08) 60%,
      transparent 100%
    );
    animation: shimmer 2s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  @keyframes shimmer {
    0% {
      left: -100%;
    }
    100% {
      left: 200%;
    }
  }

  .lists-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1.5rem;
  }

  .list-card {
    background: linear-gradient(165deg, rgba(15, 15, 30, 0.95) 0%, rgba(20, 20, 40, 0.9) 100%);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(108, 92, 231, 0.2);
    border-radius: var(--radius-2xl);
    padding: 1.75rem;
    cursor: pointer;
    transition: all 0.4s var(--ease-out);
    position: relative;
    overflow: hidden;
  }

  .list-card.has-drag-handle {
    display: flex;
    flex-direction: column;
  }

  .card-drag-handle {
    align-self: center;
    border-right: none !important;
    border-bottom: 1px solid rgba(108, 92, 231, 0.1);
    margin: -1rem -1rem 0.75rem -1rem;
    padding: 0.375rem 1rem;
    width: auto;
    font-size: 1rem;
    letter-spacing: 0.15em;
  }

  /* Top glow line */
  .list-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 15%;
    right: 15%;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(108, 92, 231, 0.4),
      rgba(255, 255, 255, 0.2),
      rgba(108, 92, 231, 0.4),
      transparent
    );
  }

  /* Hover nebula effect */
  .list-card::after {
    content: '';
    position: absolute;
    top: -50%;
    right: -30%;
    width: 150px;
    height: 200%;
    background: radial-gradient(ellipse, rgba(108, 92, 231, 0.15) 0%, transparent 70%);
    opacity: 0;
    transition: opacity 0.4s;
    pointer-events: none;
  }

  .list-card:hover {
    border-color: rgba(108, 92, 231, 0.5);
    transform: translateY(-8px) scale(1.02);
    box-shadow:
      0 24px 50px rgba(0, 0, 0, 0.5),
      0 0 80px rgba(108, 92, 231, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .list-card:hover::after {
    opacity: 1;
  }

  .list-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 1.25rem;
    position: relative;
    z-index: 1;
  }

  .list-name {
    font-size: 1.375rem;
    font-weight: 700;
    flex: 1;
    margin-right: 1rem;
    letter-spacing: -0.02em;
  }

  .delete-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-lg);
    font-size: 1.375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.35;
    transition: all 0.3s var(--ease-spring);
    border: 1px solid transparent;
  }

  .delete-btn:hover {
    opacity: 1;
    background: linear-gradient(135deg, rgba(255, 107, 107, 0.3) 0%, rgba(255, 107, 107, 0.1) 100%);
    border-color: rgba(255, 107, 107, 0.5);
    color: var(--color-red);
    transform: scale(1.15);
    box-shadow: 0 0 20px rgba(255, 107, 107, 0.3);
  }

  .list-stats {
    margin-bottom: 1.25rem;
    position: relative;
    z-index: 1;
  }

  .stat-text {
    font-size: 0.9375rem;
    color: var(--color-text-muted);
    font-weight: 500;
    font-family: var(--font-mono);
  }

  .create-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .form-group label {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .form-hint {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    line-height: 1.5;
    padding: 0.75rem 1rem;
    background: rgba(108, 92, 231, 0.08);
    border-radius: var(--radius-lg);
    border: 1px solid rgba(108, 92, 231, 0.15);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 1rem;
    padding-top: 1.25rem;
    border-top: 1px solid rgba(108, 92, 231, 0.15);
  }

  /* ── Total Progress Bar ── */

  .total-progress {
    background: linear-gradient(
      135deg,
      rgba(108, 92, 231, 0.08) 0%,
      rgba(108, 92, 231, 0.03) 100%
    );
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-radius: var(--radius-xl);
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .total-progress-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .total-progress-text {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
  }

  .total-progress-stat {
    font-size: 0.875rem;
    font-weight: 700;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--color-text);
  }

  .total-progress-bar-empty {
    height: 8px;
    border-radius: var(--radius-full);
    background: rgba(108, 92, 231, 0.1);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     MOBILE RESPONSIVE STYLES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    .section {
      margin-bottom: 2rem;
    }

    .total-progress {
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
    }

    .section-header {
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .section-header h2 {
      font-size: 1.5rem;
      text-align: center;
    }

    .section-header .btn {
      width: 100%;
      justify-content: center;
      padding: 1rem;
    }


    .lists-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .list-card {
      padding: 1.25rem;
      border-radius: var(--radius-xl);
    }

    .list-card:hover {
      transform: none;
    }

    .list-card:active {
      transform: scale(0.98);
      transition: transform 0.1s;
    }

    .list-name {
      font-size: 1.125rem;
    }

    .delete-btn {
      width: 44px;
      height: 44px;
      opacity: 0.5;
    }

    .skeleton-card {
      padding: 1.25rem;
      border-radius: var(--radius-xl);
    }

    .skeleton-title {
      height: 1.125rem;
    }

    .error-banner {
      flex-direction: column;
      gap: 1rem;
      text-align: center;
    }

    .error-banner button {
      width: 100%;
    }
  }

  /* iPhone 14/15/16 Pro Max specific (430px) */
  @media (min-width: 430px) and (max-width: 640px) {
    .section-header h2 {
      font-size: 1.625rem;
    }

    .list-card {
      padding: 1.5rem;
    }
  }

  /* Very small devices (iPhone SE) */
  @media (max-width: 375px) {
    .section-header h2 {
      font-size: 1.375rem;
    }

    .list-card {
      padding: 1rem;
    }

    .list-name {
      font-size: 1rem;
    }
  }
</style>
