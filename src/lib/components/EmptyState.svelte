<script lang="ts">
  /**
   * @fileoverview EmptyState — decorative placeholder shown when a list or view has no content.
   *
   * Renders a centered column with an animated emoji icon, a gradient-shimmer title,
   * an optional description, and an optional action slot (e.g. "Create" button).
   * The entire block floats over two layered nebula pseudo-element glows for
   * visual richness on the space-themed UI.
   *
   * Usage:
   *   <EmptyState icon="🚀" title="No projects yet" description="Get started!">
   *     <Button>Create Project</Button>
   *   </EmptyState>
   */

  // =============================================================================
  //  Props Interface
  // =============================================================================

  interface Props {
    /** Emoji displayed as the large hero icon — defaults to clipboard */
    icon?: string;
    /** Headline text shown below the icon */
    title: string;
    /** Optional body copy rendered below the title */
    description?: string;
    /** Optional slot for CTA buttons / actions */
    children?: import('svelte').Snippet;
  }

  // =============================================================================
  //  Imports
  // =============================================================================

  import { truncateTooltip } from 'stellar-drive/actions';

  // =============================================================================
  //  Component State
  // =============================================================================

  let { icon = '📋', title, description, children }: Props = $props();
</script>

<!-- ═══ Layout ═══ -->
<div class="empty-state">
  <!-- Hero emoji icon — animated with `iconOrbit` keyframes -->
  <span class="empty-icon">{icon}</span>

  <!-- Gradient-shimmer title with truncation tooltip for overflow -->
  <h3 class="empty-title" use:truncateTooltip>{title}</h3>

  <!-- Optional descriptive paragraph -->
  {#if description}
    <p class="empty-description">{description}</p>
  {/if}

  <!-- Optional action slot (buttons, links, etc.) -->
  {#if children}
    <div class="empty-actions">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  /* ═══ Container ═══ */

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 5rem 2rem;
    text-align: center;
    position: relative;
  }

  /* ═══ Nebula Glow Layers ═══ */

  /* Main nebula glow — purple-to-pink radial gradient */
  .empty-state::before {
    content: '';
    position: absolute;
    width: 300px;
    height: 300px;
    background: radial-gradient(
      ellipse at center,
      rgba(108, 92, 231, 0.3) 0%,
      rgba(255, 121, 198, 0.1) 40%,
      transparent 70%
    );
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.6;
    animation: nebulaFloat 8s var(--ease-smooth) infinite;
  }

  @keyframes nebulaFloat {
    0%,
    100% {
      transform: translate(0, 0) scale(1);
      opacity: 0.6;
    }
    50% {
      transform: translate(-20px, -20px) scale(1.1);
      opacity: 0.8;
    }
  }

  /* Secondary accent glow — green tint, offset right */
  .empty-state::after {
    content: '';
    position: absolute;
    width: 200px;
    height: 200px;
    background: radial-gradient(ellipse at center, rgba(38, 222, 129, 0.15) 0%, transparent 60%);
    border-radius: 50%;
    filter: blur(60px);
    opacity: 0.5;
    top: 30%;
    right: 20%;
    animation: nebulaFloat 10s var(--ease-smooth) infinite reverse;
  }

  /* ═══ Icon ═══ */

  .empty-icon {
    font-size: 5rem;
    margin-bottom: 2rem;
    animation: iconOrbit 6s var(--ease-smooth) infinite;
    filter: drop-shadow(0 0 30px rgba(108, 92, 231, 0.4));
    position: relative;
    z-index: 1;
  }

  /* Gentle bobbing orbit to make the icon feel alive */
  @keyframes iconOrbit {
    0%,
    100% {
      transform: translateY(0) rotate(0deg);
    }
    25% {
      transform: translateY(-15px) rotate(5deg);
    }
    50% {
      transform: translateY(0) rotate(0deg);
    }
    75% {
      transform: translateY(-10px) rotate(-5deg);
    }
  }

  /* ═══ Title ═══ */

  .empty-title {
    font-size: 1.75rem;
    font-weight: 800;
    margin-bottom: 1rem;
    background: linear-gradient(
      135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 50%,
      var(--color-accent) 100%
    );
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    position: relative;
    z-index: 1;
    animation: textShimmer 6s linear infinite;
  }

  /* Continuously scrolls the gradient for a shimmer effect */
  @keyframes textShimmer {
    0% {
      background-position: 0% center;
    }
    100% {
      background-position: 200% center;
    }
  }

  /* ═══ Description ═══ */

  .empty-description {
    color: var(--color-text-muted);
    max-width: 360px;
    margin-bottom: 2.5rem;
    line-height: 1.8;
    position: relative;
    z-index: 1;
    font-size: 1rem;
  }

  /* ═══ Actions Slot ═══ */

  .empty-actions {
    display: flex;
    gap: 1rem;
    position: relative;
    z-index: 1;
  }

  /* ═══ Mobile Responsive — iPhone 16 Pro Optimized ═══ */

  @media (max-width: 640px) {
    .empty-state {
      padding: 3rem 1.5rem;
    }

    .empty-state::before {
      width: 200px;
      height: 200px;
    }

    .empty-state::after {
      width: 140px;
      height: 140px;
    }

    .empty-icon {
      font-size: 3.5rem;
      margin-bottom: 1.5rem;
    }

    .empty-title {
      font-size: 1.375rem;
      margin-bottom: 0.75rem;
    }

    .empty-description {
      font-size: 0.9375rem;
      max-width: 300px;
      margin-bottom: 2rem;
      line-height: 1.7;
    }

    .empty-actions {
      flex-direction: column;
      width: 100%;
      max-width: 280px;
    }

    /* Force full-width buttons on mobile */
    .empty-actions :global(.btn) {
      width: 100%;
      justify-content: center;
    }
  }

  /* ═══ iPhone SE (≤375px) ═══ */

  @media (max-width: 375px) {
    .empty-state {
      padding: 2.5rem 1rem;
    }

    .empty-icon {
      font-size: 3rem;
    }

    .empty-title {
      font-size: 1.25rem;
    }

    .empty-description {
      font-size: 0.875rem;
    }
  }

  /* ═══ iPhone Pro Max (430px+) ═══ */

  @media (min-width: 430px) and (max-width: 640px) {
    .empty-state {
      padding: 4rem 2rem;
    }

    .empty-icon {
      font-size: 4rem;
    }

    .empty-title {
      font-size: 1.5rem;
    }
  }
</style>
