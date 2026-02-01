import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { goto } from '$app/navigation';
import { initEngine, startSyncEngine, supabase } from '@prabhask5/stellar-engine';
import { initConfig } from '@prabhask5/stellar-engine/config';
import { resolveAuthState } from '@prabhask5/stellar-engine/auth';
import type { AuthMode, OfflineCredentials } from '$lib/types';
import type { Session } from '@prabhask5/stellar-engine/types';
import type { LayoutLoad } from './$types';

export const ssr = true;
export const prerender = false;

// Initialize browser-only features once
if (browser) {
  initEngine({
    tables: [
      {
        supabaseName: 'goal_lists',
        dexieTable: 'goalLists',
        columns: 'id,user_id,name,project_id,order,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'goals',
        dexieTable: 'goals',
        columns:
          'id,goal_list_id,name,type,target_value,current_value,completed,order,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'daily_routine_goals',
        dexieTable: 'dailyRoutineGoals',
        columns:
          'id,user_id,name,type,target_value,start_target_value,end_target_value,progression_schedule,start_date,end_date,active_days,order,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'daily_goal_progress',
        dexieTable: 'dailyGoalProgress',
        columns:
          'id,daily_routine_goal_id,date,current_value,completed,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'task_categories',
        dexieTable: 'taskCategories',
        columns:
          'id,user_id,name,color,order,project_id,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'commitments',
        dexieTable: 'commitments',
        columns:
          'id,user_id,name,section,order,project_id,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'daily_tasks',
        dexieTable: 'dailyTasks',
        columns: 'id,user_id,name,order,completed,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'long_term_tasks',
        dexieTable: 'longTermTasks',
        columns:
          'id,user_id,name,due_date,category_id,completed,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'focus_settings',
        dexieTable: 'focusSettings',
        columns:
          'id,user_id,focus_duration,break_duration,long_break_duration,cycles_before_long_break,auto_start_breaks,auto_start_focus,created_at,updated_at,deleted,_version,device_id',
        isSingleton: true
      },
      {
        supabaseName: 'focus_sessions',
        dexieTable: 'focusSessions',
        columns:
          'id,user_id,started_at,ended_at,phase,status,current_cycle,total_cycles,focus_duration,break_duration,phase_started_at,phase_remaining_ms,elapsed_duration,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'block_lists',
        dexieTable: 'blockLists',
        columns:
          'id,user_id,name,active_days,is_enabled,order,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'blocked_websites',
        dexieTable: 'blockedWebsites',
        columns: 'id,block_list_id,domain,created_at,updated_at,deleted,_version,device_id'
      },
      {
        supabaseName: 'projects',
        dexieTable: 'projects',
        columns:
          'id,user_id,name,is_current,order,tag_id,commitment_id,goal_list_id,created_at,updated_at,deleted,_version,device_id'
      }
    ],
    database: {
      name: 'GoalPlannerDB',
      versions: [
        {
          version: 2,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at'
          }
        },
        {
          version: 3,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at'
          }
        },
        {
          version: 4,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at'
          },
          upgrade: async (tx) => {
            const routines = await tx.table('dailyRoutineGoals').toArray();
            const sorted = routines.sort(
              (a: { created_at: string }, b: { created_at: string }) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            for (let i = 0; i < sorted.length; i++) {
              await tx.table('dailyRoutineGoals').update(sorted[i].id, { order: i });
            }
          }
        },
        {
          version: 5,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, order, created_at, updated_at',
            commitments: 'id, user_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at'
          }
        },
        {
          version: 6,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, order, created_at, updated_at',
            commitments: 'id, user_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at'
          }
        },
        {
          version: 7,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, order, created_at, updated_at',
            commitments: 'id, user_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at'
          }
        },
        {
          version: 8,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, order, created_at, updated_at',
            commitments: 'id, user_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at'
          },
          upgrade: async (tx) => {
            const tables = [
              'goalLists',
              'goals',
              'dailyRoutineGoals',
              'dailyGoalProgress',
              'taskCategories',
              'commitments',
              'dailyTasks',
              'longTermTasks',
              'focusSettings',
              'focusSessions',
              'blockLists',
              'blockedWebsites'
            ];
            for (const tableName of tables) {
              const records = await tx.table(tableName).toArray();
              for (const record of records) {
                if (record._version === undefined) {
                  await tx.table(tableName).update(record.id, { _version: 1 });
                }
              }
            }
          }
        },
        {
          version: 9,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, order, created_at, updated_at',
            commitments: 'id, user_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at'
          }
        },
        {
          version: 10,
          stores: {
            goalLists: 'id, user_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, order, created_at, updated_at',
            commitments: 'id, user_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at'
          }
        },
        {
          version: 11,
          stores: {
            goalLists: 'id, user_id, project_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, project_id, order, created_at, updated_at',
            commitments: 'id, user_id, project_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at',
            projects: 'id, user_id, is_current, order, created_at, updated_at'
          }
        },
        {
          version: 12,
          stores: {
            goalLists: 'id, user_id, project_id, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, project_id, order, created_at, updated_at',
            commitments: 'id, user_id, project_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at',
            projects: 'id, user_id, is_current, order, created_at, updated_at'
          }
        },
        {
          version: 13,
          stores: {
            goalLists: 'id, user_id, project_id, order, created_at, updated_at',
            goals: 'id, goal_list_id, order, created_at, updated_at',
            dailyRoutineGoals: 'id, user_id, order, start_date, end_date, created_at, updated_at',
            dailyGoalProgress:
              'id, daily_routine_goal_id, date, [daily_routine_goal_id+date], updated_at',
            taskCategories: 'id, user_id, project_id, order, created_at, updated_at',
            commitments: 'id, user_id, project_id, section, order, created_at, updated_at',
            dailyTasks: 'id, user_id, order, created_at, updated_at',
            longTermTasks: 'id, user_id, due_date, category_id, created_at, updated_at',
            focusSettings: 'id, user_id, updated_at',
            focusSessions: 'id, user_id, started_at, ended_at, status, updated_at',
            blockLists: 'id, user_id, order, updated_at',
            blockedWebsites: 'id, block_list_id, updated_at',
            projects: 'id, user_id, is_current, order, created_at, updated_at'
          },
          upgrade: async (tx) => {
            const lists = await tx.table('goalLists').toArray();
            lists.sort(
              (a: { created_at: string }, b: { created_at: string }) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            for (let i = 0; i < lists.length; i++) {
              await tx.table('goalLists').update(lists[i].id, { order: i });
            }
          }
        }
      ]
    },
    supabase,
    prefix: 'stellar',
    auth: {
      profileExtractor: (meta: Record<string, unknown>) => ({
        firstName: (meta.first_name as string) || '',
        lastName: (meta.last_name as string) || ''
      }),
      profileToMetadata: (p: Record<string, unknown>) => ({
        first_name: p.firstName,
        last_name: p.lastName
      }),
      confirmRedirectPath: '/confirm',
      adminCheck: (user) => user?.app_metadata?.is_admin === true
    },
    onAuthStateChange: (event, session) => {
      if (event === 'SIGNED_OUT') {
        goto('/login');
      } else if (event === 'SIGNED_IN' && session) {
        if (!window.location.pathname.startsWith('/login')) {
          goto(window.location.pathname, { invalidateAll: true });
        }
      }
    },
    onAuthKicked: (_message) => {
      goto('/login');
    }
  });
}

export interface LayoutData {
  session: Session | null;
  authMode: AuthMode;
  offlineProfile: OfflineCredentials | null;
}

export const load: LayoutLoad = async ({ url }): Promise<LayoutData> => {
  if (browser) {
    const config = await initConfig();

    if (!config && url.pathname !== '/setup') {
      redirect(307, '/setup');
    }

    if (!config) {
      return { session: null, authMode: 'none', offlineProfile: null };
    }

    const result = await resolveAuthState();
    if (result.authMode !== 'none') {
      await startSyncEngine();
    }
    return result;
  }
  return { session: null, authMode: 'none', offlineProfile: null };
};
