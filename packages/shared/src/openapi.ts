/**
 * The OpenAPI description of `/api/v1`, built from the same zod schemas the
 * server validates with. `docs/openapi.json` is this document written to disk
 * (a test keeps the two in sync) and the app serves it at `/api/v1/openapi.json`.
 */
import { z } from "zod";
import * as s from "./schemas.ts";

type Method = "get" | "post" | "put" | "patch" | "delete";

interface Param {
  name: string;
  description: string;
  required?: boolean;
  example?: string;
}

interface Operation {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  description?: string;
  public?: boolean;
  path_params?: Param[];
  query?: Param[];
  body?: string;
  response: string;
  status?: number;
  errors?: number[];
}

const zOk = z.object({ ok: z.literal(true) });
const zReorderRequest = z.object({ items: z.array(s.zReorder).min(1).max(500) });
const zSites = z.object({
  id: s.zId,
  sites: z.array(z.object({ id: s.zId, pattern: z.string() })),
});
const zQuoteList = s.zListEnvelope(s.zQuote);
const zMoved = z.object({
  count: z.number().int(),
  today: s.zDate,
  moved: z
    .array(z.object({ id: s.zId, due_date: s.zDate }))
    .describe("Each task that moved, with its previous due date"),
});
const zRoutineDays = z.object({
  data: z.array(s.zRoutineDay),
  streaks: z
    .record(z.string(), z.object({ streak: z.number().int(), broken: z.boolean() }))
    .describe("Keyed by routine id"),
});

/** Named schemas, emitted under `components.schemas`. */
export const SCHEMAS: Record<string, z.ZodType> = {
  Error: s.zErrorBody,
  Ok: zOk,
  Instance: s.zInstance,
  PinRequest: s.zPinRequest,
  PinResponse: s.zPinResponse,
  RefreshRequest: s.zRefreshRequest,
  Session: s.zSession,
  RefreshResponse: z.object({ session: s.zSession }),
  DeviceList: z.object({ data: z.array(s.zDevice) }),
  Settings: s.zSettings,
  SettingsUpdate: s.zSettingsUpdate,
  TaskList: s.zTaskList,
  TaskListCreate: s.zTaskListCreate,
  TaskListUpdate: s.zTaskListUpdate,
  TaskListPage: s.zListEnvelope(s.zTaskList),
  Task: s.zTask,
  TaskCreate: s.zTaskCreate,
  TaskUpdate: s.zTaskUpdate,
  TaskPage: s.zListEnvelope(s.zTask),
  PostponeResult: zMoved,
  ReorderRequest: zReorderRequest,
  GoalList: s.zGoalList,
  GoalListPage: s.zListEnvelope(s.zGoalList),
  Goal: s.zGoal,
  GoalCreate: s.zGoalCreate,
  GoalUpdate: s.zGoalUpdate,
  GoalIncrement: s.zGoalIncrement,
  GoalPage: s.zListEnvelope(s.zGoal),
  Event: s.zEvent,
  EventCreate: s.zEventCreate,
  EventUpdate: s.zEventUpdate,
  EventPage: s.zListEnvelope(s.zEvent),
  Routine: s.zRoutine,
  RoutineCreate: s.zRoutineCreate,
  RoutineUpdate: s.zRoutineUpdate,
  RoutinePage: s.zListEnvelope(s.zRoutine),
  RoutineDays: zRoutineDays,
  RoutineLog: s.zRoutineLog,
  RoutineLogSet: s.zRoutineLogSet,
  FocusSettings: s.zFocusSettings,
  FocusSettingsUpdate: s.zFocusSettingsUpdate,
  FocusSnapshot: s.zFocusSnapshot,
  FocusActionRequest: s.zFocusActionRequest,
  FocusActionResponse: s.zFocusActionResponse,
  FocusSessionPage: s.zListEnvelope(s.zFocusSession),
  FocusStats: s.zFocusStats,
  BlockList: s.zBlockList,
  BlockListCreate: s.zBlockListCreate,
  BlockListUpdate: s.zBlockListUpdate,
  BlockListPage: s.zListEnvelope(s.zBlockList),
  BlockListSites: zSites,
  SitesChange: s.zSitesAdd,
  UniverseSnapshot: s.zUniverseSnapshot,
  Quote: s.zQuote,
  QuoteCreate: s.zQuoteCreate,
  QuotePage: zQuoteList,
  PushSubscribe: s.zPushSubscribe,
  PushUnsubscribe: s.zPushUnsubscribe,
  Export: s.zExport,
};

const ID: Param[] = [{ name: "id", description: "Row id (UUID)", required: true }];
const SINCE: Param = {
  name: "updated_since",
  description:
    "ISO 8601 instant. Returns only rows changed after it, plus `deleted_ids` removed after it. Pass the previous response's `server_time`.",
  example: "2026-11-21T09:00:00.000Z",
};

function crud(
  tag: string,
  base: string,
  name: string,
  noun: string,
  extraQuery: Param[] = [],
): Operation[] {
  return [
    {
      method: "get",
      path: base,
      tag,
      summary: `List ${noun}s`,
      query: [SINCE, ...extraQuery],
      response: `${name}Page`,
    },
    {
      method: "post",
      path: base,
      tag,
      summary: `Create a ${noun}`,
      description: "Send your own `id` to make retries idempotent.",
      body: `${name}Create`,
      response: name,
      status: 201,
    },
    {
      method: "patch",
      path: `${base}/{id}`,
      tag,
      summary: `Update a ${noun}`,
      path_params: ID,
      body: `${name}Update`,
      response: name,
      errors: [404],
    },
    {
      method: "delete",
      path: `${base}/{id}`,
      tag,
      summary: `Delete a ${noun}`,
      description: "Soft delete: the row is kept for 30 days, then purged.",
      path_params: ID,
      response: "Ok",
      errors: [404],
    },
  ];
}
const reorder = (tag: string, base: string, noun: string): Operation => ({
  method: "post",
  path: `${base}/reorder`,
  tag,
  summary: `Reorder ${noun}s`,
  description:
    "Send the moved rows with their new fractional `sort_order` (between the ranks of the new neighbours).",
  body: "ReorderRequest",
  response: "Ok",
});

export const OPERATIONS: Operation[] = [
  {
    method: "get",
    path: "/instance",
    tag: "Instance",
    summary: "Discover an instance",
    description: "Public. Returns the Supabase URL and anon key a client needs for Realtime.",
    public: true,
    response: "Instance",
  },
  {
    method: "post",
    path: "/auth/pin",
    tag: "Auth",
    summary: "Sign in with the PIN",
    description:
      "Rate limited; repeated failures lock sign-in for a growing interval (`423 locked`). Extension and iOS clients receive `session`; the web app receives httpOnly cookies instead.",
    public: true,
    body: "PinRequest",
    response: "PinResponse",
    errors: [401, 423, 429],
  },
  {
    method: "post",
    path: "/auth/refresh",
    tag: "Auth",
    summary: "Refresh a session",
    public: true,
    body: "RefreshRequest",
    response: "RefreshResponse",
    errors: [401, 429],
  },
  {
    method: "post",
    path: "/auth/logout",
    tag: "Auth",
    summary: "End this session",
    response: "Ok",
  },
  {
    method: "get",
    path: "/devices",
    tag: "Auth",
    summary: "List signed-in devices",
    response: "DeviceList",
  },
  {
    method: "delete",
    path: "/devices/{id}",
    tag: "Auth",
    summary: "Revoke a device",
    path_params: ID,
    response: "Ok",
    errors: [404],
  },
  {
    method: "get",
    path: "/settings",
    tag: "Settings",
    summary: "Read settings",
    response: "Settings",
  },
  {
    method: "put",
    path: "/settings",
    tag: "Settings",
    summary: "Change settings",
    body: "SettingsUpdate",
    response: "Settings",
  },

  ...crud("Tasks", "/task-lists", "TaskList", "task list"),
  reorder("Tasks", "/task-lists", "task list"),
  {
    method: "get",
    path: "/tasks",
    tag: "Tasks",
    summary: "List tasks",
    description:
      "Without `view`: every live task, or the changes since `updated_since`. With `view`: filtered and ordered like the app's Tasks screen (`today` includes overdue).",
    query: [
      SINCE,
      {
        name: "view",
        description:
          "`today`, `all`, `calendar` (needs `from` and `to`) or `list` (needs `list_id`)",
      },
      { name: "list_id", description: "Task list id, for `view=list`" },
      { name: "from", description: "First day, `YYYY-MM-DD`, for `view=calendar`" },
      { name: "to", description: "Last day, `YYYY-MM-DD`, for `view=calendar`" },
      { name: "include_completed", description: "`true` to include completed tasks in a view" },
    ],
    response: "TaskPage",
  },
  ...crud("Tasks", "/tasks", "Task", "task").slice(1),
  reorder("Tasks", "/tasks", "task"),
  {
    method: "post",
    path: "/tasks/postpone-overdue",
    tag: "Tasks",
    summary: "Move overdue tasks to today",
    response: "PostponeResult",
  },

  ...crud("Goals", "/goal-lists", "GoalList", "goal list").map((o) => ({
    ...o,
    body: o.body?.replace("GoalList", "TaskList"),
  })),
  reorder("Goals", "/goal-lists", "goal list"),
  ...crud("Goals", "/goals", "Goal", "goal", [
    { name: "list_id", description: "Only goals in this goal list" },
  ]),
  reorder("Goals", "/goals", "goal"),
  {
    method: "post",
    path: "/goals/{id}/increment",
    tag: "Goals",
    summary: "Add to a progress goal",
    description:
      "`delta` may be negative. The amount never drops below zero; reaching the total completes the goal.",
    path_params: ID,
    body: "GoalIncrement",
    response: "Goal",
    errors: [404],
  },

  ...crud("Events", "/events", "Event", "event").map((o) =>
    o.method === "delete"
      ? { ...o, description: "Deleted for good. A tombstone is kept for `updated_since` sync." }
      : o.method === "get"
        ? {
            ...o,
            description:
              "Dates and deadlines to count down to, earliest first. `date` (and `time`, when set) are in the owner's time zone.",
          }
        : o,
  ),

  ...crud("Routines", "/routines", "Routine", "routine"),
  reorder("Routines", "/routines", "routine"),
  {
    method: "get",
    path: "/routines/days",
    tag: "Routines",
    summary: "Routine instances per day",
    description:
      "For each date: the routines scheduled that day, their logged result, and the day's completion. At most 400 days.",
    query: [
      { name: "from", description: "First day, `YYYY-MM-DD`", required: true },
      { name: "to", description: "Last day, `YYYY-MM-DD`", required: true },
    ],
    response: "RoutineDays",
  },
  {
    method: "put",
    path: "/routines/{id}/logs/{date}",
    tag: "Routines",
    summary: "Log a routine for a day",
    path_params: [...ID, { name: "date", description: "`YYYY-MM-DD`", required: true }],
    body: "RoutineLogSet",
    response: "RoutineLog",
    errors: [404],
  },

  {
    method: "get",
    path: "/focus/settings",
    tag: "Focus",
    summary: "Read timer settings",
    response: "FocusSettings",
  },
  {
    method: "put",
    path: "/focus/settings",
    tag: "Focus",
    summary: "Change timer settings",
    description: "`active_block_list_ids` chooses which block lists apply during focus.",
    body: "FocusSettingsUpdate",
    response: "FocusSettings",
  },
  {
    method: "get",
    path: "/focus/state",
    tag: "Focus",
    summary: "Timer state",
    description:
      "State, settings, what is blocked right now, and the server clock. Compute the countdown as `phase_ends_at - (now + skew)`.",
    response: "FocusSnapshot",
  },
  {
    method: "post",
    path: "/focus/actions",
    tag: "Focus",
    summary: "Change the timer",
    description:
      "The server applies the transition only if `expectedVersion` matches the current `state.version`. On `409` the body has `ok: false`, the reason, and the current state to adopt.",
    body: "FocusActionRequest",
    response: "FocusActionResponse",
    errors: [409],
  },
  {
    method: "get",
    path: "/focus/sessions",
    tag: "Focus",
    summary: "Finished phases",
    query: [
      SINCE,
      { name: "from", description: "Lower bound on `started_at` (date or timestamp)" },
      { name: "to", description: "Upper bound on `started_at` (date or timestamp)" },
    ],
    response: "FocusSessionPage",
  },
  {
    method: "get",
    path: "/focus/stats",
    tag: "Focus",
    summary: "Focus statistics",
    query: [{ name: "days", description: "Length of the per-day series (default 30, max 366)" }],
    response: "FocusStats",
  },

  ...crud("Blocking", "/block-lists", "BlockList", "block list"),
  reorder("Blocking", "/block-lists", "block list"),
  {
    method: "post",
    path: "/block-lists/{id}/sites",
    tag: "Blocking",
    summary: "Add sites to a block list",
    description:
      "Anything URL-like is reduced to a bare domain (`https://www.YouTube.com/watch` → `youtube.com`); a domain covers its subdomains.",
    path_params: ID,
    body: "SitesChange",
    response: "BlockListSites",
    errors: [404],
  },
  {
    method: "delete",
    path: "/block-lists/{id}/sites",
    tag: "Blocking",
    summary: "Remove sites from a block list",
    path_params: ID,
    body: "SitesChange",
    response: "BlockListSites",
    errors: [404],
  },

  {
    method: "get",
    path: "/universe/snapshot",
    tag: "Universe",
    summary: "Universe snapshot",
    response: "UniverseSnapshot",
  },
  {
    method: "get",
    path: "/quotes/random",
    tag: "Quotes",
    summary: "A random quote",
    response: "Quote",
  },
  {
    method: "get",
    path: "/quotes",
    tag: "Quotes",
    summary: "List quotes",
    description: "Built-in quotes and your own.",
    query: [SINCE],
    response: "QuotePage",
  },
  {
    method: "post",
    path: "/quotes",
    tag: "Quotes",
    summary: "Add a quote",
    body: "QuoteCreate",
    response: "Quote",
    status: 201,
  },
  {
    method: "delete",
    path: "/quotes",
    tag: "Quotes",
    summary: "Delete one of your quotes",
    query: [{ name: "id", description: "Quote id", required: true }],
    response: "Ok",
    errors: [404],
  },

  {
    method: "post",
    path: "/push/subscriptions",
    tag: "Push",
    summary: "Register a Web Push subscription",
    body: "PushSubscribe",
    response: "Ok",
    status: 201,
  },
  {
    method: "delete",
    path: "/push/subscriptions",
    tag: "Push",
    summary: "Remove a Web Push subscription",
    body: "PushUnsubscribe",
    response: "Ok",
  },
  {
    method: "get",
    path: "/export",
    tag: "Data",
    summary: "Export everything as JSON",
    response: "Export",
  },
  {
    method: "post",
    path: "/import",
    tag: "Data",
    summary: "Import an export",
    description: "Merges by id; importing the same file twice changes nothing.",
    body: "Export",
    response: "Ok",
  },
];

const ERROR_TEXT: Record<number, string> = {
  400: "The request was not valid",
  401: "Missing, expired or revoked session",
  404: "Not found",
  409: "The state changed first",
  423: "Sign-in is temporarily locked",
  429: "Too many requests",
};

/** JSON Schema for a zod schema, as request input or response output. */
function jsonSchema(schema: z.ZodType, io: "input" | "output"): unknown {
  const out = z.toJSONSchema(schema, {
    io,
    unrepresentable: "any",
    target: "draft-2020-12",
  }) as Record<string, unknown>;
  delete out.$schema;
  return relax(out);
}

/** Responses may gain fields in later versions, so nothing is declared closed. */
function relax(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(relax);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "additionalProperties" && v === false) continue;
      out[k] = relax(v);
    }
    return out;
  }
  return node;
}

const REQUEST_SCHEMAS = new Set(OPERATIONS.map((o) => o.body).filter(Boolean));

export function buildOpenApi(version = "1.0.0"): Record<string, unknown> {
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const errorResponse = (description: string) => ({
    description,
    content: { "application/json": { schema: ref("Error") } },
  });
  const paths: Record<string, Record<string, unknown>> = {};

  for (const op of OPERATIONS) {
    if (!SCHEMAS[op.response] || (op.body && !SCHEMAS[op.body]))
      throw new Error(`Unknown schema in ${op.method} ${op.path}`);
    const parameters = [
      ...(op.path_params ?? []).map((p) => ({
        name: p.name,
        in: "path",
        required: true,
        description: p.description,
        schema: { type: "string" },
      })),
      ...(op.query ?? []).map((p) => ({
        name: p.name,
        in: "query",
        required: p.required ?? false,
        description: p.description,
        schema: { type: "string" },
        ...(p.example ? { example: p.example } : {}),
      })),
    ];
    const responses: Record<string, unknown> = {
      [String(op.status ?? 200)]: {
        description: "Success",
        content: { "application/json": { schema: ref(op.response) } },
      },
    };
    const errors = new Set([
      ...(op.body || op.query ? [400] : []),
      ...(op.public ? [] : [401, 429]),
      ...(op.errors ?? []),
    ]);
    for (const status of [...errors].sort())
      responses[String(status)] = errorResponse(ERROR_TEXT[status] ?? "Error");
    (paths[op.path] ??= {})[op.method] = {
      operationId: `${op.method}${op.path.replace(/[{}]/g, "").replace(/[/-]+(\w)/g, (_, c: string) => c.toUpperCase())}`,
      tags: [op.tag],
      summary: op.summary,
      ...(op.description ? { description: op.description } : {}),
      ...(op.public ? { security: [] } : {}),
      ...(parameters.length ? { parameters } : {}),
      ...(op.body
        ? {
            requestBody: {
              required: true,
              content: { "application/json": { schema: ref(op.body) } },
            },
          }
        : {}),
      responses,
    };
  }

  const schemas: Record<string, unknown> = {};
  for (const name of Object.keys(SCHEMAS).sort()) {
    schemas[name] = jsonSchema(
      SCHEMAS[name] as z.ZodType,
      REQUEST_SCHEMAS.has(name) ? "input" : "output",
    );
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Stellar Planner API",
      version,
      description:
        "REST API of a self-hosted Stellar Planner instance. Sign in with `POST /auth/pin` and send the returned access token as `Authorization: Bearer <token>`; it is forwarded to Supabase, so row-level security applies. Errors are `{ error: { code, message } }`. List endpoints accept `updated_since` and return `deleted_ids` for delta sync.",
    },
    servers: [
      {
        url: "{appUrl}/api/v1",
        variables: {
          appUrl: {
            default: "https://planner.example.com",
            description: "Where your instance is served",
          },
        },
      },
    ],
    security: [{ bearer: [] }],
    tags: [...new Set(OPERATIONS.map((o) => o.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Supabase access token from `POST /auth/pin`",
        },
      },
      schemas,
    },
  };
}
