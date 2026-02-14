<script lang="ts">
  /**
   * @fileoverview LongTermTaskCalendar — monthly calendar grid showing tasks on their due dates.
   *
   * Renders a standard 7-column month view with navigation arrows, a "today"
   * shortcut, and coloured task chips inside each day cell.  On desktop the
   * chips show truncated task names; on mobile a compact numeric badge is
   * displayed instead.  Overdue task chips pulse with a red glow animation.
   *
   * Key behaviours:
   * - `getTasksForDate` filters incomplete tasks whose `due_date` matches a cell.
   * - Desktop shows up to 2 task chips plus a "+N" overflow label.
   * - Mobile replaces chips with a small count badge (`task-count-indicator`).
   * - A "today" pill appears in the header when viewing a non-current month.
   */

  import {
    getDaysInMonth,
    getWeekdayNames,
    getFirstDayOfMonthWeekday,
    formatDate,
    formatMonthYear,
    isTodayDate,
    parseDateString
  } from '$lib/utils/dates';
  import { addMonths, subMonths } from 'date-fns';
  import type { LongTermTaskWithCategory } from '$lib/types';
  import { truncateTooltip } from '@prabhask5/stellar-engine/actions';

  // =============================================================================
  //                                  Props
  // =============================================================================

  interface Props {
    /** The Date object representing the currently viewed month */
    currentDate: Date;
    /** Full list of long-term tasks to overlay on the calendar */
    tasks: LongTermTaskWithCategory[];
    /** Callback when a day cell is clicked */
    onDayClick: (date: Date) => void;
    /** Callback when a task chip is clicked */
    onTaskClick: (task: LongTermTaskWithCategory) => void;
    /** Callback when the month changes (via arrows or "today" button) */
    onMonthChange: (date: Date) => void;
  }

  let { currentDate, tasks, onDayClick, onTaskClick, onMonthChange }: Props = $props();

  // =============================================================================
  //                          Derived Grid Data
  // =============================================================================

  /** Short weekday labels (e.g. ["Sun", "Mon", ...]) — constant across renders */
  const weekdays = getWeekdayNames();

  /** Array of Date objects for every day in the current month */
  const days = $derived(getDaysInMonth(currentDate));

  /** Number of blank cells before the 1st of the month (0 = Sunday start) */
  const firstDayOffset = $derived(getFirstDayOfMonthWeekday(currentDate));

  // =============================================================================
  //                       Month Navigation Handlers
  // =============================================================================

  /**
   * Navigate to the previous month.
   */
  function goToPreviousMonth() {
    onMonthChange(subMonths(currentDate, 1));
  }

  /**
   * Navigate to the next month.
   */
  function goToNextMonth() {
    onMonthChange(addMonths(currentDate, 1));
  }

  /**
   * Jump back to the current real-world month.
   */
  function goToToday() {
    onMonthChange(new Date());
  }

  // =============================================================================
  //                          Derived Helpers
  // =============================================================================

  /**
   * Whether the calendar is currently showing the real-world month.
   * Controls visibility of the "today" shortcut pill.
   */
  const isViewingCurrentMonth = $derived(() => {
    const today = new Date();
    return (
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  });

  // =============================================================================
  //                          Utility Functions
  // =============================================================================

  /**
   * Return incomplete tasks whose `due_date` matches the given calendar date.
   * @param {Date} date - The calendar cell date
   * @returns {LongTermTaskWithCategory[]} Matching incomplete tasks
   */
  function getTasksForDate(date: Date): LongTermTaskWithCategory[] {
    const dateStr = formatDate(date);
    return tasks.filter((t) => t.due_date === dateStr && !t.completed);
  }

  /**
   * Check whether a task is past its due date (and still incomplete).
   * @param {LongTermTaskWithCategory} task - The task to check
   * @returns {boolean} `true` if the task is overdue
   */
  function isOverdue(task: LongTermTaskWithCategory): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDueDate = parseDateString(task.due_date);
    return taskDueDate < today && !task.completed;
  }
</script>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Template — Calendar Container
     ═══════════════════════════════════════════════════════════════════════════ -->

<div class="calendar">
  <!-- ═══ Header — Month Title & Navigation Arrows ═══ -->
  <div class="calendar-header">
    <button class="nav-btn" onclick={goToPreviousMonth} aria-label="Previous month">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
    <div class="month-title-wrapper">
      <h2 class="month-title">
        {formatMonthYear(currentDate)}
        <!-- "today" pill — only visible when viewing a different month -->
        {#if !isViewingCurrentMonth()}
          <button class="today-btn" onclick={goToToday}>today</button>
        {/if}
      </h2>
    </div>
    <button class="nav-btn" onclick={goToNextMonth} aria-label="Next month">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  </div>

  <!-- ═══ Weekday Header Row ═══ -->
  <div class="calendar-weekdays">
    {#each weekdays as day (day)}
      <div class="weekday">{day}</div>
    {/each}
  </div>

  <!-- ═══ Day Grid — Blank Offsets + Day Cells ═══ -->
  <div class="calendar-grid">
    <!-- Leading empty cells for days before the 1st of the month -->
    {#each Array(firstDayOffset) as _, _i (_i)}
      <div class="day-cell empty" aria-hidden="true"></div>
    {/each}

    <!-- One cell per day in the month -->
    {#each days as day (day.toISOString())}
      {@const isToday = isTodayDate(day)}
      {@const dayTasks = getTasksForDate(day)}
      {@const hasTasksDue = dayTasks.length > 0}

      <div
        class="day-cell"
        class:today={isToday}
        class:has-tasks={hasTasksDue}
        onclick={() => onDayClick(day)}
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onDayClick(day)}
        role="button"
        tabindex="0"
        aria-label="{formatDate(day)}{hasTasksDue ? `, ${dayTasks.length} task(s) due` : ''}"
      >
        <span class="day-number">{day.getDate()}</span>
        {#if hasTasksDue}
          <!-- ═══ Desktop: Coloured Task Chips (max 2 + overflow) ═══ -->
          <div class="task-chips desktop-only">
            {#each dayTasks.slice(0, 2) as task (task.id)}
              <button
                class="task-chip"
                class:overdue={isOverdue(task)}
                style="--chip-color: {task.category?.color || '#6c5ce7'}"
                onclick={(e) => {
                  e.stopPropagation();
                  onTaskClick(task);
                }}
                use:truncateTooltip
              >
                {task.name}
              </button>
            {/each}
            {#if dayTasks.length > 2}
              <span class="more-tasks">+{dayTasks.length - 2}</span>
            {/if}
          </div>
          <!-- ═══ Mobile: Compact Numeric Task Count Badge ═══ -->
          <div class="task-count-indicator mobile-only">
            <span class="task-count" class:multiple={dayTasks.length > 1}>
              {dayTasks.length}
            </span>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Styles
     ═══════════════════════════════════════════════════════════════════════════ -->

<style>
  /* ═══ Calendar Container ═══ */

  .calendar {
    background: linear-gradient(
      165deg,
      rgba(15, 15, 30, 0.95) 0%,
      rgba(10, 10, 22, 0.98) 50%,
      rgba(15, 15, 30, 0.95) 100%
    );
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: var(--radius-2xl);
    overflow: hidden;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.03) inset,
      0 16px 48px rgba(0, 0, 0, 0.5),
      0 0 100px rgba(108, 92, 231, 0.1);
    position: relative;
  }

  /* Top edge iridescent shine line */
  .calendar::before {
    content: '';
    position: absolute;
    top: 0;
    left: 10%;
    right: 10%;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(108, 92, 231, 0.5),
      rgba(255, 255, 255, 0.3),
      rgba(255, 121, 198, 0.4),
      transparent
    );
  }

  /* ═══ Calendar Header ═══ */

  .calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid rgba(108, 92, 231, 0.15);
    background: linear-gradient(180deg, rgba(108, 92, 231, 0.1) 0%, transparent 100%);
    position: relative;
    z-index: 1;
  }

  /* ═══ Navigation Buttons ═══ */

  .nav-btn {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s var(--ease-spring);
    border: 1px solid rgba(108, 92, 231, 0.2);
    background: rgba(30, 30, 55, 0.6);
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .nav-btn:hover {
    background: var(--gradient-primary);
    border-color: transparent;
    transform: scale(1.1);
    box-shadow: 0 0 25px var(--color-primary-glow);
    color: white;
  }

  /* ═══ Month Title ═══ */

  .month-title-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .month-title {
    font-size: 1.375rem;
    font-weight: 700;
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
    letter-spacing: -0.02em;
  }

  /* ═══ "Today" Shortcut Pill ═══ */

  .today-btn {
    font-size: 0.5625rem;
    font-weight: 700;
    padding: 0.2rem 0.5rem;
    margin-left: 0.5rem;
    background: rgba(108, 92, 231, 0.12);
    border: 1px solid rgba(108, 92, 231, 0.25);
    border-radius: var(--radius-full);
    color: var(--color-primary-light);
    cursor: pointer;
    transition: all 0.2s var(--ease-out);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    vertical-align: middle;
    line-height: 1;
    -webkit-text-fill-color: var(--color-primary-light);
    background-clip: padding-box;
    -webkit-background-clip: padding-box;
  }

  .today-btn:hover {
    background: rgba(108, 92, 231, 0.25);
    border-color: rgba(108, 92, 231, 0.5);
    color: white;
    -webkit-text-fill-color: white;
  }

  .today-btn:active {
    transform: scale(0.95);
  }

  /* ═══ Weekday Header Row ═══ */

  .calendar-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    border-bottom: 1px solid rgba(108, 92, 231, 0.1);
    background: rgba(10, 10, 22, 0.5);
    position: relative;
    z-index: 1;
  }

  .weekday {
    padding: 0.75rem;
    text-align: center;
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--color-primary);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  /* ═══ Day Grid ═══ */

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    background: rgba(108, 92, 231, 0.03);
    padding: 8px;
    position: relative;
    z-index: 1;
  }

  /* ═══ Day Cell ═══ */

  .day-cell {
    min-height: 80px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 0.5rem;
    background: linear-gradient(145deg, rgba(20, 20, 40, 0.95) 0%, rgba(15, 15, 32, 0.9) 100%);
    position: relative;
    transition: all 0.3s var(--ease-out);
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    cursor: pointer;
    text-align: left;
    width: 100%;
  }

  .day-cell.empty {
    background: rgba(10, 10, 22, 0.6);
    cursor: default;
  }

  .day-cell:not(.empty):hover {
    transform: scale(1.02);
    z-index: 10;
    border-color: rgba(108, 92, 231, 0.4);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }

  /* Today highlight — purple border + glow */
  .day-cell.today {
    border-color: var(--color-primary);
    box-shadow: 0 0 20px var(--color-primary-glow);
  }

  .day-number {
    font-weight: 600;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin-bottom: 0.25rem;
  }

  .day-cell.today .day-number {
    color: var(--color-primary-light);
    font-weight: 700;
  }

  /* ═══ Task Chips (Desktop) ═══ */

  .task-chips {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
    overflow: hidden;
  }

  .task-chip {
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0.2rem 0.4rem;
    border-radius: var(--radius-sm);
    background: var(--chip-color);
    color: white;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border: none;
    cursor: pointer;
    transition: all 0.2s var(--ease-out);
    text-align: left;
    width: 100%;
    max-width: 100%;
  }

  .task-chip:hover {
    transform: scale(1.02);
    box-shadow: 0 0 12px var(--chip-color);
  }

  /* Overdue chip — pulsing red glow */
  .task-chip.overdue {
    animation: overdueGlow 2s ease-in-out infinite;
  }

  @keyframes overdueGlow {
    0%,
    100% {
      box-shadow: 0 0 5px rgba(255, 107, 107, 0.5);
    }
    50% {
      box-shadow: 0 0 15px rgba(255, 107, 107, 0.8);
    }
  }

  .more-tasks {
    font-size: 0.5625rem;
    font-weight: 600;
    color: var(--color-text-muted);
    padding: 0.125rem 0.25rem;
  }

  /* ═══ Desktop / Mobile Visibility ═══ */

  .desktop-only {
    display: flex;
  }

  .mobile-only {
    display: none;
  }

  /* ═══ Mobile Task Count Badge ═══ */

  .task-count-indicator {
    position: absolute;
    bottom: 4px;
    right: 4px;
  }

  .task-count {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    font-size: 0.625rem;
    font-weight: 700;
    color: white;
    background: var(--gradient-primary);
    border-radius: var(--radius-full);
    box-shadow: 0 2px 8px var(--color-primary-glow);
  }

  .task-count.multiple {
    background: linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%);
  }

  /* ═══ Mobile Adjustments ═══ */

  @media (max-width: 640px) {
    .calendar {
      border-radius: var(--radius-xl);
    }

    .calendar-header {
      padding: 1rem 1.25rem;
    }

    .month-title {
      font-size: 1.125rem;
      white-space: nowrap;
    }

    .today-btn {
      font-size: 0.5rem;
      padding: 0.15rem 0.4rem;
      margin-left: 0.375rem;
    }

    .nav-btn {
      width: 36px;
      height: 36px;
    }

    .day-cell {
      min-height: 44px;
      padding: 0.375rem;
      aspect-ratio: 1;
    }

    .day-cell:not(.empty):hover {
      transform: none;
    }

    .day-number {
      font-size: 0.75rem;
    }

    .weekday {
      font-size: 0.5625rem;
      padding: 0.5rem;
    }

    /* Hide task chips on mobile, show count indicator */
    .desktop-only {
      display: none !important;
    }

    .mobile-only {
      display: flex !important;
    }

    .task-count-indicator {
      bottom: 3px;
      right: 3px;
    }

    .task-count {
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      font-size: 0.5625rem;
    }
  }
</style>
