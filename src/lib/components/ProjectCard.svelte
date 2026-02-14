<script lang="ts">
  /**
   * @fileoverview ProjectCard — clickable card displaying a project's name, stats, and progress.
   *
   * Renders a glassmorphic card for a single `ProjectWithDetails` containing:
   *   - A colored tag dot + project name
   *   - A "star" button to set/unset the project as the current active project
   *     (with cinematic ignition/fade particle animations)
   *   - A delete button
   *   - Goal and task completion stats
   *   - A `ProgressBar` showing combined completion percentage
   *   - Optional drag handle for reordering via `DraggableList`
   *
   * Clicking the card navigates to the project's goal list page.
   * Integrates with `remoteChangeAnimation` for realtime sync flashes.
   */

  // =============================================================================
  //  Imports
  // =============================================================================

  import type { ProjectWithDetails } from '$lib/types';
  import ProgressBar from '$lib/components/ProgressBar.svelte';
  import { remoteChangeAnimation } from '@prabhask5/stellar-engine/actions';
  import { truncateTooltip } from '@prabhask5/stellar-engine/actions';

  // =============================================================================
  //  Props Interface
  // =============================================================================

  interface Props {
    /** Full project data including goal list stats and task stats */
    project: ProjectWithDetails;
    /** Callback to navigate to the project's goal list */
    onNavigate: (goalListId: string) => void;
    /** Callback to set this project as the current active project */
    onSetCurrent: (projectId: string) => void;
    /** Callback to delete this project */
    onDelete: (projectId: string) => void;
    /** Drag handle event props from `DraggableList` — enables reorder handle */
    dragHandleProps?: { onpointerdown: (e: PointerEvent) => void };
  }

  // =============================================================================
  //  Component State
  // =============================================================================

  let { project, onNavigate, onSetCurrent, onDelete, dragHandleProps }: Props = $props();

  // =============================================================================
  //  Derived Values — Project Statistics
  // =============================================================================

  /** Total number of goals in this project */
  const totalGoals = $derived(project.goalList?.totalGoals ?? 0);
  /** Number of completed goals */
  const completedGoals = $derived(project.goalList?.completedGoals ?? 0);
  /** Total number of linked tasks */
  const totalTasks = $derived(project.taskStats?.totalTasks ?? 0);
  /** Number of completed linked tasks */
  const completedTasks = $derived(project.taskStats?.completedTasks ?? 0);
  /** Combined completion percentage for the progress bar */
  const completionPercentage = $derived(
    project.combinedProgress ?? project.goalList?.completionPercentage ?? 0
  );
  /** Tag color — defaults to primary purple when no tag is assigned */
  const tagColor = $derived(project.tag?.color ?? '#6c5ce7');

  // =============================================================================
  //  Star Animation State
  // =============================================================================

  /** Whether the star button is currently playing its animation */
  let starAnimating = $state(false);

  /** Previous value of `is_current` — used to detect transitions */
  let prevIsCurrent: boolean | undefined = undefined;

  /**
   * Detects changes to `project.is_current` and triggers the star animation
   * (ignition burst when becoming current, fade when losing current status).
   */
  $effect(() => {
    if (prevIsCurrent !== undefined && project.is_current !== prevIsCurrent) {
      starAnimating = true;
      setTimeout(() => {
        starAnimating = false;
      }, 800);
    }
    prevIsCurrent = project.is_current;
  });

  // =============================================================================
  //  Event Handlers
  // =============================================================================

  /**
   * Handles star button click — triggers animation and calls `onSetCurrent`.
   * Stops propagation to prevent the card's `onclick` from firing.
   *
   * @param {MouseEvent} e — the click event
   */
  function handleStarClick(e: MouseEvent) {
    e.stopPropagation();
    starAnimating = true;
    onSetCurrent(project.id);
  }
</script>

<!-- ═══ Project Card ═══ -->
<div
  class="project-card"
  class:has-drag-handle={!!dragHandleProps}
  role="button"
  tabindex="0"
  onclick={() => project.goal_list_id && onNavigate(project.goal_list_id)}
  onkeypress={(e) => e.key === 'Enter' && project.goal_list_id && onNavigate(project.goal_list_id)}
  use:remoteChangeAnimation={{ entityId: project.id, entityType: 'projects' }}
>
  <!-- Optional drag handle for reorder mode -->
  {#if dragHandleProps}
    <button class="drag-handle card-drag-handle" {...dragHandleProps} aria-label="Drag to reorder"
      >⋮⋮</button
    >
  {/if}

  <!-- ═══ Card Header ═══ -->
  <div class="project-header">
    <div class="project-title">
      <!-- Colored dot matching the project's tag color -->
      <span class="tag-dot" style="background-color: {tagColor}"></span>
      <h3 class="project-name" use:truncateTooltip>{project.name}</h3>
    </div>
    <div class="project-actions">
      <!-- Star button — marks project as current -->
      <button
        class="star-btn"
        class:is-current={project.is_current}
        class:animating={starAnimating}
        onclick={handleStarClick}
        aria-label={project.is_current ? 'Current project' : 'Set as current project'}
        title={project.is_current ? 'Current project' : 'Set as current project'}
      >
        <!-- Glow layer behind the star -->
        <span class="star-glow"></span>

        <!-- Particle burst container — 6 particles shoot outward on ignition -->
        <span class="star-particles">
          {#each Array(6) as _, i (i)}
            <span class="particle" style="--i: {i}"></span>
          {/each}
        </span>

        <!-- Ring pulse effect -->
        <span class="star-ring"></span>

        <!-- The star SVG icon (filled when current, outlined otherwise) -->
        <svg
          class="star-icon"
          viewBox="0 0 24 24"
          fill={project.is_current ? 'currentColor' : 'none'}
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          />
        </svg>
      </button>

      <!-- Delete button -->
      <button
        class="delete-btn"
        onclick={(e) => {
          e.stopPropagation();
          onDelete(project.id);
        }}
        aria-label="Delete project"
      >
        ×
      </button>
    </div>
  </div>

  <!-- ═══ Stats & Progress ═══ -->
  {#if totalGoals > 0 || totalTasks > 0}
    <div class="project-stats">
      <span class="stat-text">
        {#if totalGoals > 0}{completedGoals} / {totalGoals} goals{/if}{#if totalGoals > 0 && totalTasks > 0}
          &middot;
        {/if}{#if totalTasks > 0}{completedTasks} / {totalTasks} tasks{/if}
      </span>
    </div>
    <ProgressBar percentage={completionPercentage} />
  {/if}
</div>

<style>
  /* ═══ Card Container ═══ */

  .project-card {
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

  /* Flex column layout when drag handle is present */
  .project-card.has-drag-handle {
    display: flex;
    flex-direction: column;
  }

  /* Horizontal drag handle variant for cards */
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

  /* Top glow line — subtle gradient across card top edge */
  .project-card::before {
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

  /* Hover nebula effect — fades in on the right side */
  .project-card::after {
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

  .project-card:hover {
    border-color: rgba(108, 92, 231, 0.5);
    transform: translateY(-8px) scale(1.02);
    box-shadow:
      0 24px 50px rgba(0, 0, 0, 0.5),
      0 0 80px rgba(108, 92, 231, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .project-card:hover::after {
    opacity: 1;
  }

  /* ═══ Header ═══ */

  .project-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 1.25rem;
    position: relative;
    z-index: 1;
  }

  .project-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
  }

  /* Small colored dot representing the project's tag */
  .tag-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 8px currentColor;
  }

  .project-name {
    font-size: 1.375rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .project-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     STAR BUTTON — Cinematic Animation
     ═══════════════════════════════════════════════════════════════════════════════ */

  .star-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.4;
    transition: all 0.4s var(--ease-out);
    border: 1px solid transparent;
    color: var(--color-text-muted);
    position: relative;
    overflow: visible;
  }

  .star-btn:hover {
    opacity: 1;
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 215, 0, 0.05) 100%);
    border-color: rgba(255, 215, 0, 0.3);
    color: #ffd700;
    transform: scale(1.1);
  }

  /* Active current state — golden glow */
  .star-btn.is-current {
    opacity: 1;
    color: #ffd700;
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 215, 0, 0.05) 100%);
    border-color: rgba(255, 215, 0, 0.3);
  }

  /* ═══ Star SVG Icon ═══ */

  .star-icon {
    width: 20px;
    height: 20px;
    position: relative;
    z-index: 2;
    transition: all 0.4s var(--ease-spring);
    filter: drop-shadow(0 0 0 transparent);
  }

  .star-btn.is-current .star-icon {
    filter: drop-shadow(0 0 6px rgba(255, 215, 0, 0.6));
  }

  .star-btn:hover .star-icon {
    transform: scale(1.1);
  }

  /* ═══ Star Glow Layer ═══ */

  /* Radial golden glow behind the star */
  .star-glow {
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 215, 0, 0.4) 0%, transparent 70%);
    opacity: 0;
    transition: opacity 0.4s var(--ease-out);
    pointer-events: none;
  }

  .star-btn.is-current .star-glow {
    opacity: 1;
    animation: starGlowPulse 2s ease-in-out infinite;
  }

  @keyframes starGlowPulse {
    0%,
    100% {
      opacity: 0.6;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.2);
    }
  }

  /* ═══ Star Ring Pulse ═══ */

  /* Expanding ring that plays on ignition/fade transition */
  .star-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid #ffd700;
    opacity: 0;
    pointer-events: none;
  }

  .star-btn.animating .star-ring {
    animation: starRingExpand 0.6s var(--ease-out) forwards;
  }

  @keyframes starRingExpand {
    0% {
      opacity: 0.8;
      transform: scale(0.8);
    }
    100% {
      opacity: 0;
      transform: scale(2);
    }
  }

  /* ═══ Star Particle Burst ═══ */

  .star-particles {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  /* Small golden dots that burst outward when becoming current */
  .particle {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 4px;
    height: 4px;
    background: #ffd700;
    border-radius: 50%;
    opacity: 0;
    box-shadow: 0 0 6px #ffd700;
  }

  .star-btn.animating.is-current .particle {
    animation: particleBurst 0.7s var(--ease-out) forwards;
    animation-delay: calc(var(--i) * 0.03s);
  }

  @keyframes particleBurst {
    0% {
      opacity: 1;
      transform: translate(-50%, -50%) rotate(calc(var(--i) * 60deg)) translateY(0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) rotate(calc(var(--i) * 60deg)) translateY(-30px) scale(0);
    }
  }

  /* ═══ Star Ignition (becoming current) ═══ */

  .star-btn.animating.is-current .star-icon {
    animation: starIgnite 0.6s var(--ease-spring);
  }

  @keyframes starIgnite {
    0% {
      transform: scale(0.5) rotate(-30deg);
      filter: drop-shadow(0 0 0 transparent);
    }
    40% {
      transform: scale(1.4) rotate(10deg);
      filter: drop-shadow(0 0 20px rgba(255, 215, 0, 1));
    }
    70% {
      transform: scale(0.9) rotate(-5deg);
    }
    100% {
      transform: scale(1) rotate(0deg);
      filter: drop-shadow(0 0 6px rgba(255, 215, 0, 0.6));
    }
  }

  /* ═══ Star Fade (losing current status) ═══ */

  .star-btn.animating:not(.is-current) .star-icon {
    animation: starFade 0.5s var(--ease-out);
  }

  @keyframes starFade {
    0% {
      transform: scale(1);
      filter: drop-shadow(0 0 15px rgba(255, 215, 0, 0.8));
    }
    30% {
      transform: scale(1.2);
      filter: drop-shadow(0 0 25px rgba(255, 215, 0, 1));
    }
    100% {
      transform: scale(1);
      filter: drop-shadow(0 0 0 transparent);
    }
  }

  /* Glow burst when becoming current */
  .star-btn.animating.is-current .star-glow {
    animation: glowBurst 0.6s var(--ease-out);
  }

  @keyframes glowBurst {
    0% {
      opacity: 0;
      transform: scale(0.5);
    }
    30% {
      opacity: 1;
      transform: scale(2);
    }
    100% {
      opacity: 0.6;
      transform: scale(1);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════ */

  /* ═══ Delete Button ═══ */

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

  /* ═══ Stats ═══ */

  .project-stats {
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

  /* ═══ Mobile Responsive ═══ */

  @media (max-width: 640px) {
    .project-card {
      padding: 1.25rem;
      border-radius: var(--radius-xl);
    }

    /* Disable lift-on-hover for mobile — use tap feedback instead */
    .project-card:hover {
      transform: none;
    }

    .project-card:active {
      transform: scale(0.98);
      transition: transform 0.1s;
    }

    .project-name {
      font-size: 1.125rem;
    }

    /* Larger touch targets on mobile */
    .star-btn,
    .delete-btn {
      width: 44px;
      height: 44px;
      opacity: 0.5;
    }

    .star-btn.is-current {
      opacity: 1;
    }

    .star-icon {
      width: 22px;
      height: 22px;
    }
  }

  /* ═══ iPhone 14/15/16 Pro Max (430px) ═══ */

  @media (min-width: 430px) and (max-width: 640px) {
    .project-card {
      padding: 1.5rem;
    }
  }

  /* ═══ Very Small Devices (iPhone SE) ═══ */

  @media (max-width: 375px) {
    .project-card {
      padding: 1rem;
    }

    .project-name {
      font-size: 1rem;
    }
  }

  /* ═══ Reduced Motion ═══ */

  @media (prefers-reduced-motion: reduce) {
    .star-btn.animating .star-icon,
    .star-btn.animating .star-ring,
    .star-btn.animating .star-glow,
    .star-btn.animating .particle,
    .star-btn.is-current .star-glow {
      animation: none;
    }
  }
</style>
