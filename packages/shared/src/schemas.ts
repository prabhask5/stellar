/**
 * zod schemas for every boundary: API requests and responses, config, and the
 * shapes clients persist. `docs/openapi.json` is generated from these.
 */
import { z } from "zod";
import { isDateStr, isValidTimeZone, normalizeTime } from "./dates.ts";
import { normalizeSitePattern } from "./normalize.ts";

// ── primitives ──────────────────────────────────────────────────────────────
export const zId = z.uuid().describe("UUID");
export const zDate = z
  .string()
  .refine(isDateStr, "Use a date in YYYY-MM-DD format.")
  .describe("Calendar date, YYYY-MM-DD");
export const zTime = z
  .string()
  .refine((v) => normalizeTime(v) !== null, "Use a time in HH:MM format.")
  .transform((v) => normalizeTime(v) as string)
  .describe("Time of day, HH:MM (24h)");
export const zTimestamp = z.string().describe("ISO 8601 timestamp");
export const zEmoji = z.string().min(1).max(32);
export const zSortOrder = z.number().finite();
export const zTimeZone = z.string().refine(isValidTimeZone, "Unknown time zone.");

export const zGoalType = z.enum(["todo", "progress"]);
export const zFrequency = z.enum(["daily", "weekdays", "interval"]);
export const zTimerStatus = z.enum(["idle", "running", "paused", "awaiting"]);
export const zTimerPhase = z.enum(["focus", "short_break", "long_break"]);
export const zTimerAction = z.enum(["start", "pause", "resume", "skip", "end", "advance"]);
export const zDeviceKind = z.enum(["web", "pwa", "extension", "ios"]);
export const zQualityTier = z.enum(["auto", "cinematic", "balanced", "minimal"]);

// ── errors ──────────────────────────────────────────────────────────────────
export const zErrorCode = z.enum([
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "locked",
  "not_configured",
  "upstream_error",
  "internal_error",
]);
export type ErrorCode = z.infer<typeof zErrorCode>;

export const zErrorBody = z.object({
  error: z.object({
    code: zErrorCode,
    message: z.string(),
    retry_after_seconds: z.number().int().optional(),
  }),
});
export type ErrorBody = z.infer<typeof zErrorBody>;

// ── instance & auth ─────────────────────────────────────────────────────────
export const zInstance = z.object({
  name: z.literal("Stellar Planner"),
  version: z.string(),
  apiVersion: z.literal(1),
  configured: z.boolean(),
  supabaseUrl: z.string().nullable(),
  supabaseAnonKey: z.string().nullable(),
  vapidPublicKey: z.string().nullable().optional(),
});
export type Instance = z.infer<typeof zInstance>;

export const zPin = z.string().regex(/^\d{6,12}$/, "Your PIN must be 6 to 12 digits.");

export const zDeviceInput = z.object({
  name: z.string().trim().min(1).max(120),
  kind: zDeviceKind,
});

export const zPinRequest = z.object({ pin: z.string().min(1).max(64), device: zDeviceInput });
export type PinRequest = z.infer<typeof zPinRequest>;

export const zSession = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.number().int().describe("Unix seconds"),
  expires_in: z.number().int().optional(),
  token_type: z.literal("bearer").optional(),
  user_id: zId,
});
export type SessionTokens = z.infer<typeof zSession>;

export const zPinResponse = z.object({
  ok: z.literal(true),
  device_id: zId.nullable(),
  /** Present for extension and iOS clients only; web clients get httpOnly cookies. */
  session: zSession.optional(),
});
export const zRefreshRequest = z.object({ refresh_token: z.string().min(1) });
export const zChangePinRequest = z.object({
  current_pin: z.string().min(1).max(64),
  new_pin: zPin,
});

export const zDevice = z.object({
  id: zId,
  name: z.string(),
  kind: zDeviceKind,
  last_seen_at: zTimestamp,
  created_at: zTimestamp,
  revoked_at: zTimestamp.nullable(),
  current: z.boolean().optional(),
});
export type DeviceInfo = z.infer<typeof zDevice>;

// ── settings ────────────────────────────────────────────────────────────────
export const zSettings = z.object({
  timezone: zTimeZone,
  week_start: z.union([z.literal(0), z.literal(1)]),
  birthdate: zDate.nullable(),
  lifespan_years: z.number().int().min(1).max(150),
  quality_tier: zQualityTier,
  show_completed: z.boolean(),
  lock_after_minutes: z.number().int().positive().nullable(),
  updated_at: zTimestamp.optional(),
});
export const zSettingsUpdate = zSettings.omit({ updated_at: true }).partial();
export type SettingsUpdate = z.infer<typeof zSettingsUpdate>;

// ── tasks ───────────────────────────────────────────────────────────────────
const zName = (max: number) => z.string().trim().min(1, "Give it a name.").max(max);
const zDescription = z.string().trim().max(5000).nullable();

export const zTaskList = z.object({
  id: zId,
  name: z.string(),
  emoji: zEmoji,
  sort_order: zSortOrder,
  deleted_at: zTimestamp.nullable(),
  created_at: zTimestamp,
  updated_at: zTimestamp,
});
export const zTaskListCreate = z.object({
  id: zId.optional(),
  name: zName(120),
  emoji: zEmoji.optional(),
  sort_order: zSortOrder.optional(),
});
export const zTaskListUpdate = zTaskListCreate.omit({ id: true }).partial();

export const zTask = z.object({
  id: zId,
  name: z.string(),
  description: z.string().nullable(),
  due_date: zDate.nullable(),
  due_time: z.string().nullable(),
  list_id: zId.nullable(),
  completed: z.boolean(),
  completed_at: zTimestamp.nullable(),
  sort_order: zSortOrder,
  deleted_at: zTimestamp.nullable(),
  created_at: zTimestamp,
  updated_at: zTimestamp,
});

const taskRules = <
  T extends { list_id?: string | null; due_date?: string | null; due_time?: string | null },
>(
  v: T,
  ctx: z.RefinementCtx,
) => {
  if (v.list_id && (v.due_date || v.due_time)) {
    ctx.addIssue({
      code: "custom",
      path: ["due_date"],
      message: "Tasks in a list can't have a due date.",
    });
  }
  if (v.due_time && v.due_date === null) {
    ctx.addIssue({ code: "custom", path: ["due_time"], message: "A due time needs a due date." });
  }
};

export const zTaskCreate = z
  .object({
    id: zId.optional().describe("Client-generated id, so retries are idempotent"),
    name: zName(500),
    description: zDescription.optional(),
    due_date: zDate.nullable().optional(),
    due_time: zTime.nullable().optional(),
    list_id: zId.nullable().optional(),
    completed: z.boolean().optional(),
    sort_order: zSortOrder.optional(),
  })
  .superRefine((v, ctx) => {
    taskRules(v, ctx);
    if (v.due_time && !v.due_date) {
      ctx.addIssue({ code: "custom", path: ["due_time"], message: "A due time needs a due date." });
    }
  });
export const zTaskUpdate = z
  .object({
    name: zName(500).optional(),
    description: zDescription.optional(),
    due_date: zDate.nullable().optional(),
    due_time: zTime.nullable().optional(),
    list_id: zId.nullable().optional(),
    completed: z.boolean().optional(),
    sort_order: zSortOrder.optional(),
  })
  .superRefine(taskRules);

export const zTaskView = z.enum(["today", "all", "calendar", "list"]);
export const zReorder = z.object({
  id: zId,
  sort_order: zSortOrder.describe("New fractional rank, between the ranks of its new neighbours"),
});

// ── goals ───────────────────────────────────────────────────────────────────
export const zGoalList = zTaskList;
export const zGoalListCreate = zTaskListCreate;
export const zGoalListUpdate = zTaskListUpdate;

export const zGoal = z.object({
  id: zId,
  list_id: zId,
  name: z.string(),
  description: z.string().nullable(),
  type: zGoalType,
  current_amount: z.number(),
  total_amount: z.number().nullable(),
  unit: z.string().nullable(),
  completed: z.boolean(),
  completed_at: zTimestamp.nullable(),
  sort_order: zSortOrder,
  deleted_at: zTimestamp.nullable(),
  created_at: zTimestamp,
  updated_at: zTimestamp,
});
const zAmount = z.number().finite().min(0);
export const zGoalCreate = z
  .object({
    id: zId.optional(),
    list_id: zId,
    name: zName(500),
    description: zDescription.optional(),
    type: zGoalType.default("todo"),
    total_amount: z.number().finite().positive().nullable().optional(),
    current_amount: zAmount.optional(),
    unit: z.string().trim().max(40).nullable().optional(),
    completed: z.boolean().optional(),
    sort_order: zSortOrder.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "progress" && !v.total_amount) {
      ctx.addIssue({
        code: "custom",
        path: ["total_amount"],
        message: "A progress goal needs a total above zero.",
      });
    }
  });
export const zGoalUpdate = z.object({
  list_id: zId.optional(),
  name: zName(500).optional(),
  description: zDescription.optional(),
  type: zGoalType.optional(),
  total_amount: z.number().finite().positive().nullable().optional(),
  current_amount: zAmount.optional(),
  unit: z.string().trim().max(40).nullable().optional(),
  completed: z.boolean().optional(),
  sort_order: zSortOrder.optional(),
});
export const zGoalIncrement = z.object({ delta: z.number().finite() });

// ── routines ────────────────────────────────────────────────────────────────
export const zRoutine = z.object({
  id: zId,
  name: z.string(),
  description: z.string().nullable(),
  emoji: z.string().nullable(),
  type: zGoalType,
  total_amount: z.number().nullable(),
  unit: z.string().nullable(),
  start_date: zDate,
  end_date: zDate.nullable(),
  frequency: zFrequency,
  weekdays: z.array(z.number().int().min(0).max(6)).nullable(),
  interval_days: z.number().int().nullable(),
  sort_order: zSortOrder,
  created_at: zTimestamp,
  updated_at: zTimestamp,
});

const routineFields = {
  name: zName(200),
  description: zDescription.optional(),
  emoji: zEmoji.nullable().optional(),
  type: zGoalType,
  total_amount: z.number().finite().positive().nullable().optional(),
  unit: z.string().trim().max(40).nullable().optional(),
  start_date: zDate,
  end_date: zDate.nullable().optional(),
  frequency: zFrequency,
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
  interval_days: z.number().int().min(2).max(3650).nullable().optional(),
  sort_order: zSortOrder.optional(),
};

const routineRules = (
  v: {
    type?: string;
    total_amount?: number | null;
    frequency?: string;
    weekdays?: number[] | null;
    interval_days?: number | null;
    start_date?: string;
    end_date?: string | null;
  },
  ctx: z.RefinementCtx,
) => {
  if (v.type === "progress" && v.total_amount !== undefined && !v.total_amount) {
    ctx.addIssue({
      code: "custom",
      path: ["total_amount"],
      message: "A progress routine needs a total above zero.",
    });
  }
  if (v.frequency === "weekdays" && v.weekdays !== undefined && (v.weekdays ?? []).length === 0) {
    ctx.addIssue({ code: "custom", path: ["weekdays"], message: "Pick at least one weekday." });
  }
  if (v.frequency === "interval" && v.interval_days !== undefined && (v.interval_days ?? 0) < 2) {
    ctx.addIssue({
      code: "custom",
      path: ["interval_days"],
      message: "Use an interval of at least 2 days.",
    });
  }
  if (v.start_date && v.end_date && v.end_date < v.start_date) {
    ctx.addIssue({
      code: "custom",
      path: ["end_date"],
      message: "The end date can't be before the start date.",
    });
  }
};

export const zRoutineCreate = z
  .object({ id: zId.optional(), ...routineFields })
  .superRefine((v, ctx) => {
    routineRules(v, ctx);
    if (v.type === "progress" && !v.total_amount) {
      ctx.addIssue({
        code: "custom",
        path: ["total_amount"],
        message: "A progress routine needs a total above zero.",
      });
    }
    if (v.frequency === "weekdays" && !(v.weekdays ?? []).length) {
      ctx.addIssue({ code: "custom", path: ["weekdays"], message: "Pick at least one weekday." });
    }
    if (v.frequency === "interval" && !v.interval_days) {
      ctx.addIssue({
        code: "custom",
        path: ["interval_days"],
        message: "Use an interval of at least 2 days.",
      });
    }
  });
export const zRoutineUpdate = z.object(routineFields).partial().superRefine(routineRules);

export const zRoutineLog = z.object({
  routine_id: zId,
  date: zDate,
  completed: z.boolean(),
  amount: z.number(),
  updated_at: zTimestamp,
});
export const zRoutineLogSet = z
  .object({ completed: z.boolean().optional(), amount: zAmount.optional() })
  .refine((v) => v.completed !== undefined || v.amount !== undefined, "Send completed or amount.");

export const zRoutineDay = z.object({
  date: zDate,
  fraction: z.number().nullable(),
  percent: z.number().nullable(),
  instances: z.array(
    z.object({
      routine_id: zId,
      name: z.string(),
      emoji: z.string().nullable(),
      type: zGoalType,
      total_amount: z.number().nullable(),
      unit: z.string().nullable(),
      completed: z.boolean(),
      amount: z.number(),
      progress: z.number(),
    }),
  ),
});

// ── focus ───────────────────────────────────────────────────────────────────
export const zFocusSettings = z.object({
  focus_min: z.number().int().min(1).max(600),
  short_break_min: z.number().int().min(1).max(600),
  long_break_min: z.number().int().min(1).max(600),
  rounds_before_long: z.number().int().min(1).max(12),
  auto_start_breaks: z.boolean(),
  auto_start_focus: z.boolean(),
  active_block_list_ids: z.array(zId),
  updated_at: zTimestamp.optional(),
});
export const zFocusSettingsUpdate = zFocusSettings.omit({ updated_at: true }).partial();

export const zFocusState = z.object({
  status: zTimerStatus,
  phase: zTimerPhase,
  round: z.number().int(),
  phase_started_at: zTimestamp.nullable(),
  phase_ends_at: zTimestamp.nullable(),
  paused_remaining_ms: z.number().int().nullable(),
  phase_total_ms: z.number().int().nullable(),
  session_id: zId.nullable(),
  version: z.number().int(),
  last_completed_phase: zTimerPhase.nullable(),
  last_completed_at: zTimestamp.nullable(),
  updated_at: zTimestamp,
});

export const zBlockingState = z.object({
  active: z.boolean(),
  lists: z.array(z.object({ id: zId, name: z.string(), emoji: z.string().nullable() })),
  patterns: z.array(z.string()),
});

export const zFocusSnapshot = z.object({
  state: zFocusState,
  settings: zFocusSettings,
  blocking: zBlockingState,
  server_time: zTimestamp,
});

export const zFocusActionRequest = z.object({
  action: zTimerAction,
  expectedVersion: z.number().int().min(0),
});
export const zFocusActionResponse = z.object({
  ok: z.boolean(),
  error: z.enum(["version_conflict", "invalid_transition", "not_due"]).nullable(),
  state: zFocusState,
  session: z
    .object({
      started_at: zTimestamp,
      ended_at: zTimestamp,
      phase: zTimerPhase,
      planned_seconds: z.number().int(),
      actual_seconds: z.number().int(),
      completed: z.boolean(),
      round: z.number().int(),
    })
    .nullable(),
  server_time: zTimestamp,
});

export const zFocusSession = z.object({
  id: zId,
  session_id: zId.nullable(),
  started_at: zTimestamp,
  ended_at: zTimestamp,
  phase: zTimerPhase,
  planned_seconds: z.number().int(),
  actual_seconds: z.number().int(),
  completed: z.boolean(),
  round: z.number().int(),
});

export const zFocusStats = z.object({
  today: zDate,
  today_minutes: z.number(),
  total_minutes: z.number(),
  streak_days: z.number().int(),
  days: z.array(z.object({ date: zDate, minutes: z.number() })),
});

export const zBlockList = z.object({
  id: zId,
  name: z.string(),
  emoji: z.string().nullable(),
  sort_order: zSortOrder,
  deleted_at: zTimestamp.nullable(),
  created_at: zTimestamp,
  updated_at: zTimestamp,
  sites: z.array(z.object({ id: zId, pattern: z.string() })).optional(),
});
export const zBlockListCreate = z.object({
  id: zId.optional(),
  name: zName(120),
  emoji: zEmoji.nullable().optional(),
  sort_order: zSortOrder.optional(),
});
export const zBlockListUpdate = zBlockListCreate.omit({ id: true }).partial();

export const zSitePattern = z.string().transform((v, ctx) => {
  const r = normalizeSitePattern(v);
  if (!r.ok) {
    ctx.addIssue({ code: "custom", message: r.message });
    return z.NEVER;
  }
  return r.value;
});
export const zSitesAdd = z.object({
  patterns: z.array(z.string().min(1).max(300)).min(1).max(500),
});
export const zSitesRemove = z.object({
  patterns: z.array(z.string().min(1).max(300)).min(1).max(500),
});

// ── universe ────────────────────────────────────────────────────────────────
export const zUniverseSnapshot = z.object({
  stars: z.object({
    count: z.number(),
    recent: z.array(z.object({ id: zId, at: zTimestamp.nullable() })),
    months: z.array(z.object({ month: z.string(), count: z.number() })),
  }),
  lists: z.array(
    z.object({
      id: zId,
      name: z.string(),
      emoji: z.string(),
      total: z.number(),
      complete: z.number(),
      fraction: z.number(),
      all_complete: z.boolean(),
    }),
  ),
  planets: z.array(
    z.object({
      id: zId,
      list_id: zId,
      name: z.string(),
      type: zGoalType,
      progress: z.number(),
      completed: z.boolean(),
    }),
  ),
  constellations: z.array(
    z.object({
      id: zId,
      name: z.string(),
      emoji: z.string().nullable(),
      streak: z.number(),
      stars: z.number(),
      broken: z.boolean(),
    }),
  ),
  server_time: zTimestamp,
});
export type UniverseSnapshot = z.infer<typeof zUniverseSnapshot>;

// ── quotes, push, data ──────────────────────────────────────────────────────
export const zQuote = z.object({
  id: zId,
  text: z.string(),
  author: z.string(),
  is_builtin: z.boolean(),
  created_at: zTimestamp.optional(),
});
export const zQuoteCreate = z.object({
  id: zId.optional(),
  text: z.string().trim().min(1, "Write the quote first.").max(500),
  author: z.string().trim().max(120).default(""),
});

export const zPushSubscribe = z.object({
  endpoint: z.url().startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  device_id: zId.nullable().optional(),
});
export const zPushUnsubscribe = z.object({ endpoint: z.url() });

export const zExport = z
  .object({
    format: z.literal("stellar-planner-export"),
    format_version: z.literal(1),
    schema_version: z.number().int().nullable().optional(),
    exported_at: zTimestamp,
  })
  .loose();

export const zListQuery = z.object({
  updated_since: zTimestamp
    .optional()
    .describe("Return only rows changed after this instant (delta sync)"),
  include_deleted: z.coerce.boolean().optional(),
});

/** Envelope used by every list endpoint. */
export const zListEnvelope = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    deleted_ids: z.array(z.string()).describe("Ids removed since `updated_since`"),
    server_time: zTimestamp,
  });
