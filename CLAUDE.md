# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The main project goal should have the following features:

- The planner should have two types of goal "lists": one should be a one time goal list (like a todo list basically), and the other should be daily routine goals that should happen every day. I want a two page interface for this: one interface is the todo lists where I'm able to make multiple different goal lists, and within each goal list there should be goals of multiple types (more details in the next bullet point); and the other interface is a calendar where each day will contain goals (of the same types as the other list), where the main interface should show all the days for the month and the previous days goal completion by a color (more information on this in a later bullet point).
- Each type of goal list should support two types of goals. One type of goal is just a one time completion like a todo list item, and the other should have a goal number and a increment feature to increment until you hit the goal number. This goal number goal item should have a color system where the goal is colored red and progressively gets greener when you increment. The one time goal item should should be red when its not complete and green when it is complete.
- For the goal list interface page, the main page should show all the "goal lists" I've made, with the goal list having a name, and a "completion progression" number where it shows how much of the goals I've completed of the goal list. Whenever I click on a goal list, I can see the details of all the goals there for all the goal types supported.
- For the calendar daily routine goal list interface page, the main page should be a calendar with the month and the year and should show all the days for the month. For each PAST day, I want a "completion progression" number similar to the other interface goal lists, alongside them being colored from a red to green color scale. This only applies for past days, future days don't need information on them obviously. Whenever you click on a day, you can view the goals for the daily routine goals calculated based on what daily routine goals are active on that day (more information in the next bullet point). All the goal types previously talked about should be supported. If there isn't any goals for a specific day, the logic should be the same as if the day was in the future.
- Relevant only to the daily routine page, we should be able to create new daily routine goals. The goal types should be all the ones previously mentioned, we of course should be able to name any goal, and should be able to select a date range where the daily routine goal is active, and that goal should only show on the calendar and affect the completion progression number if its active on that day.
- CRUD operations should all be supported for daily routine goals, goal lists
- I would like to access this on my computer and phone and have them be synced
- The app should be as fast and efficient as possible

## Commands

```bash
npm run dev      # Start development server (localhost:5173)
npm run build    # Production build
npm run preview  # Preview production build
```

No test framework is configured.

## Architecture

This is a SvelteKit 2 / Svelte 5 application using Supabase for the backend. It's a PWA for tracking personal goals.

### Data Model

Two main goal systems with separate database tables:

1. **Goal Lists** (`goal_lists` + `goals` tables): One-time goals organized in lists
   - Each goal can be "completion" (checkbox) or "incremental" (progress toward target)
   - Goals track `current_value`, `target_value`, `completed` state

2. **Daily Routines** (`daily_routine_goals` + `daily_goal_progress` tables): Recurring daily goals
   - Each routine has a date range (`start_date`, `end_date`)
   - Progress tracked per-day in `daily_goal_progress` table

### Key Files

- `src/lib/types.ts` - TypeScript interfaces for all data models
- `src/lib/supabase/database.ts` - All Supabase CRUD operations (no server-side API routes)
- `src/lib/supabase/client.ts` - Supabase client initialization
- `src/lib/utils/colors.ts` - Progress color calculation (red-to-green gradient based on completion %)
- `supabase-schema.sql` - Database schema with RLS policies

### Route Structure

- `/lists` - Goal list management
- `/lists/[id]` - Individual list with its goals
- `/calendar` - Monthly calendar showing daily routine completion
- `/calendar/[date]` - Daily progress view for routines
- `/routines` - Manage daily routine goal definitions
- `/routines/[id]` - Edit individual routine

### Patterns

- Components use Svelte 5 runes (`$props()`, `$state()`)
- Database calls are direct from components via `$lib/supabase/database.ts`
- No server-side load functions - all data fetched client-side
- Styling uses CSS custom properties defined in `src/app.css`

### Environment Variables

Required in `.env`:
```
PUBLIC_SUPABASE_URL=your-project-url
PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key
```
