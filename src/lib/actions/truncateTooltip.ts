/**
 * Truncate Tooltip Action
 *
 * A Svelte action that ensures text elements have ellipsis overflow handling
 * and shows a floating tooltip with the full text when content is truncated.
 *
 * - Desktop: tooltip on hover (only when text is actually truncated)
 * - Mobile: tooltip on tap, dismisses on tap-outside or after 3s
 * - Uses a shared singleton tooltip element on document.body
 *
 * Usage:
 * ```svelte
 * <span class="my-text" use:truncateTooltip>{longText}</span>
 * ```
 */

let tooltipEl: HTMLElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
let currentOwner: HTMLElement | null = null;

function getTooltip(): HTMLElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'truncate-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function isTruncated(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth;
}

function positionTooltip(tooltip: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();

  // Default: centered above the element
  let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
  let top = rect.top - tooltipRect.height - 8;

  // If tooltip would overflow top, show below instead
  if (top < 4) {
    top = rect.bottom + 8;
  }

  // Clamp horizontal position to viewport
  const maxLeft = window.innerWidth - tooltipRect.width - 8;
  left = Math.max(8, Math.min(left, maxLeft));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showTooltip(anchor: HTMLElement): void {
  if (!isTruncated(anchor)) return;

  const tooltip = getTooltip();
  const fullText = anchor.textContent?.trim() || '';
  if (!fullText) return;

  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  tooltip.textContent = fullText;
  tooltip.classList.add('visible');
  currentOwner = anchor;

  // Position after content is set so dimensions are correct
  requestAnimationFrame(() => {
    positionTooltip(tooltip, anchor);
  });
}

function hideTooltip(): void {
  if (tooltipEl) {
    tooltipEl.classList.remove('visible');
  }
  currentOwner = null;
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
}

function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function truncateTooltip(node: HTMLElement) {
  // Ensure ellipsis CSS is applied
  node.style.overflow = 'hidden';
  node.style.textOverflow = 'ellipsis';
  node.style.whiteSpace = 'nowrap';

  function handleMouseEnter(): void {
    if (isTouchDevice()) return;
    showTooltip(node);
  }

  function handleMouseLeave(): void {
    if (currentOwner === node) {
      hideTooltip();
    }
  }

  function handleTap(e: Event): void {
    if (!isTouchDevice()) return;
    if (!isTruncated(node)) return;

    e.preventDefault();
    e.stopPropagation();

    if (currentOwner === node) {
      hideTooltip();
      return;
    }

    showTooltip(node);

    // Auto-dismiss after 3s
    hideTimeout = setTimeout(hideTooltip, 3000);
  }

  function handleTapOutside(e: Event): void {
    if (!currentOwner || currentOwner !== node) return;
    const target = e.target as HTMLElement;
    if (target === node || node.contains(target)) return;
    if (tooltipEl && (target === tooltipEl || tooltipEl.contains(target))) return;
    hideTooltip();
  }

  node.addEventListener('mouseenter', handleMouseEnter);
  node.addEventListener('mouseleave', handleMouseLeave);
  node.addEventListener('touchstart', handleTap, { passive: false });
  document.addEventListener('touchstart', handleTapOutside, { passive: true });

  return {
    destroy() {
      node.removeEventListener('mouseenter', handleMouseEnter);
      node.removeEventListener('mouseleave', handleMouseLeave);
      node.removeEventListener('touchstart', handleTap);
      document.removeEventListener('touchstart', handleTapOutside);

      if (currentOwner === node) {
        hideTooltip();
      }
    }
  };
}
