# Stellar Planner REST API v1

Every Stellar Planner instance serves this API at `{your app URL}/api/v1`. It is what the browser extension uses to connect, and what an iOS app or your own scripts can use for everything else.

- Machine-readable description: [`docs/openapi.json`](./openapi.json), also served by your instance at `/api/v1/openapi.json`. It is generated from the same zod schemas the server validates with (`pnpm openapi`), and a test fails if the two drift.
- All bodies are JSON. Dates are `YYYY-MM-DD`, times `HH:MM`, timestamps ISO 8601 in UTC.

## Authentication

1. `GET /instance` (public) confirms the address is a Stellar Planner and returns the Supabase URL and anon key.
2. `POST /auth/pin` exchanges the PIN for a Supabase session.
3. Send `Authorization: Bearer <access_token>` on every other request. The token is forwarded to Supabase, so row-level security applies to everything you do.
4. Access tokens are short-lived. `POST /auth/refresh` with the `refresh_token` returns a new pair; refresh tokens rotate, so store the new one.

```bash
APP=https://planner.example.com

curl -s $APP/api/v1/instance
# {"name":"Stellar Planner","version":"1.0.0","apiVersion":1,"configured":true,
#  "supabaseUrl":"https://supabase.example.com","supabaseAnonKey":"eyJ…","vapidPublicKey":"B…"}

curl -s -X POST $APP/api/v1/auth/pin -H 'Content-Type: application/json' \
  -d '{"pin":"246810","device":{"name":"My script","kind":"ios"}}'
# {"ok":true,"device_id":"…","session":{"access_token":"eyJ…","refresh_token":"…","expires_at":1795000000,"user_id":"…"}}

TOKEN=eyJ…
curl -s -X POST $APP/api/v1/auth/refresh -H 'Content-Type: application/json' -d '{"refresh_token":"…"}'
# {"session":{"access_token":"…","refresh_token":"…","expires_at":…,"user_id":"…"}}
```

`device.kind` is `web`, `pwa`, `extension` or `ios`. `extension` and `ios` receive the session in the body; `web` and `pwa` receive httpOnly cookies instead. Each sign-in appears under Settings → Devices and can be revoked there or with `DELETE /devices/:id`. `POST /auth/logout` ends the current session.

**Rate limits and lockout.** Auth endpoints are rate limited per IP address (`429 rate_limited` with `Retry-After`). Wrong PINs lock sign-in for a growing interval (`423 locked`, with `retry_after_seconds`). All other endpoints share a generous per-session budget of 1,200 requests a minute.

## Errors

```json
{
  "error": { "code": "bad_request", "message": "due_date: Tasks in a list can't have a due date." }
}
```

| Status | `code`           | Meaning                                               |
| ------ | ---------------- | ----------------------------------------------------- |
| 400    | `bad_request`    | Validation failed; `message` says which field and why |
| 401    | `unauthorized`   | No session, or it expired or was revoked              |
| 403    | `forbidden`      | Not allowed                                           |
| 404    | `not_found`      | No such row (or it is not yours)                      |
| 409    | `conflict`       | Duplicate, or the timer changed first                 |
| 423    | `locked`         | Too many wrong PINs; wait `retry_after_seconds`       |
| 429    | `rate_limited`   | Slow down; see `Retry-After`                          |
| 502    | `upstream_error` | Supabase could not be reached or refused              |
| 503    | `not_configured` | The instance has not finished setup                   |
| 500    | `internal_error` | Unexpected                                            |

## Lists and delta sync

Every list endpoint returns the same envelope:

```json
{ "data": [ … ], "deleted_ids": [ … ], "server_time": "2026-11-21T09:00:00.000Z" }
```

- First sync: call without parameters to get every live row. Keep `server_time`.
- `server_time` is the database's clock, the same clock that stamps every change, so the cursor is immune to clock differences between your device, the app server and the database. Never substitute a local timestamp for it.
- Later: pass it back as `?updated_since=<server_time>`. `data` holds rows created or changed since then; `deleted_ids` holds ids removed since then (soft-deleted rows and hard deletes alike). Apply both, keep the new `server_time`.
- Deletes are soft for tasks, goals, routines and all lists: rows stay restorable for 30 days and are then purged.

**Idempotent creates.** Every `POST` that creates a row accepts a client-generated `id` (UUID). Repeating the request returns the existing row instead of creating a second one, so retries after a timeout are safe.

**Ordering.** `sort_order` is a fractional rank. To move a row, set its `sort_order` between its new neighbours' (`PATCH` the row, or `POST …/reorder` with `{ "items": [{ "id", "sort_order" }] }`).

## Endpoints

### Instance, auth, settings

| Method   | Path            | Notes                                                                                                                                |
| -------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| GET      | `/instance`     | Public                                                                                                                               |
| POST     | `/auth/pin`     | `{ pin, device: { name, kind } }`                                                                                                    |
| POST     | `/auth/refresh` | `{ refresh_token }`                                                                                                                  |
| POST     | `/auth/logout`  |                                                                                                                                      |
| GET      | `/devices`      | `{ data: Device[] }`                                                                                                                 |
| DELETE   | `/devices/:id`  | Revokes that device's session                                                                                                        |
| GET, PUT | `/settings`     | `timezone`, `week_start` (0 Sunday, 1 Monday), `birthdate`, `lifespan_years`, `quality_tier`, `show_completed`, `lock_after_minutes` |

### Tasks

| Method        | Path                      | Notes                                                                                                |
| ------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET, POST     | `/task-lists`             |                                                                                                      |
| PATCH, DELETE | `/task-lists/:id`         | Deleting a list deletes its tasks                                                                    |
| POST          | `/task-lists/reorder`     |                                                                                                      |
| GET           | `/tasks`                  | `?view=today\|all\|calendar\|list`, `list_id`, `from`, `to`, `include_completed`; or `updated_since` |
| POST          | `/tasks`                  |                                                                                                      |
| PATCH, DELETE | `/tasks/:id`              |                                                                                                      |
| POST          | `/tasks/reorder`          |                                                                                                      |
| POST          | `/tasks/postpone-overdue` | Moves overdue tasks to today; returns `{ count, today, moved }`                                      |

A task either has a due date (and optionally a time) or belongs to a list, never both. `view=today` includes overdue tasks. "Today" is evaluated in the owner's time zone (`/settings`).

```bash
curl -s -X POST $APP/api/v1/tasks -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"id":"0b0e3c1e-2f0a-4c8e-9d7b-3a1f5e6d7c8b","name":"Write report","due_date":"2026-11-21","due_time":"09:30"}'

curl -s "$APP/api/v1/tasks?view=today" -H "Authorization: Bearer $TOKEN"
curl -s -X PATCH $APP/api/v1/tasks/0b0e3c1e-2f0a-4c8e-9d7b-3a1f5e6d7c8b \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"completed":true}'
```

### Goals

| Method        | Path                   | Notes                        |
| ------------- | ---------------------- | ---------------------------- |
| GET, POST     | `/goal-lists`          |                              |
| PATCH, DELETE | `/goal-lists/:id`      |                              |
| POST          | `/goal-lists/reorder`  |                              |
| GET, POST     | `/goals`               | `?list_id=`                  |
| PATCH, DELETE | `/goals/:id`           |                              |
| POST          | `/goals/reorder`       |                              |
| POST          | `/goals/:id/increment` | `{ delta }`, may be negative |

`type` is `todo` (done or not) or `progress` (`current_amount` of `total_amount`, with an optional `unit`). A progress goal completes when it reaches its total.

### Events

Dates and deadlines the Goals page counts down to. `date` is the owner's calendar day and `time` an optional time on it (`HH:MM`); both are read in the owner's time zone (`/settings` → `timezone`). Events are deleted for good; `?updated_since=` reports removed ids.

| Method        | Path          | Notes                                                 |
| ------------- | ------------- | ----------------------------------------------------- |
| GET, POST     | `/events`     | Earliest first. Body: `name`, `emoji`, `date`, `time` |
| PATCH, DELETE | `/events/:id` |                                                       |

### Routines

| Method        | Path                       | Notes                                                                         |
| ------------- | -------------------------- | ----------------------------------------------------------------------------- |
| GET, POST     | `/routines`                |                                                                               |
| PATCH, DELETE | `/routines/:id`            |                                                                               |
| POST          | `/routines/reorder`        |                                                                               |
| GET           | `/routines/days?from=&to=` | Per-day instances and completion, plus `streaks` by routine id (max 400 days) |
| PUT           | `/routines/:id/logs/:date` | `{ completed }` or `{ amount }`                                               |

`frequency` is `daily`, `weekdays` (with `weekdays: [0–6]`, 0 = Sunday) or `interval` (with `interval_days ≥ 2`, counted from `start_date`).

```bash
curl -s -X PUT $APP/api/v1/routines/$ROUTINE/logs/2026-11-21 \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"amount":4}'
```

### Focus timer and blocking

| Method        | Path                        | Notes                                                |
| ------------- | --------------------------- | ---------------------------------------------------- |
| GET, PUT      | `/focus/settings`           | Durations, auto-start flags, `active_block_list_ids` |
| GET           | `/focus/state`              | `{ state, settings, blocking, server_time }`         |
| POST          | `/focus/actions`            | `{ action, expectedVersion }`                        |
| GET           | `/focus/sessions?from=&to=` | Finished phases, newest first                        |
| GET           | `/focus/stats?days=30`      | Today, total, streak, per-day minutes                |
| GET, POST     | `/block-lists`              | Each list includes `sites`                           |
| PATCH, DELETE | `/block-lists/:id`          |                                                      |
| POST          | `/block-lists/reorder`      |                                                      |
| POST, DELETE  | `/block-lists/:id/sites`    | `{ patterns: ["youtube.com", …] }`                   |

The timer lives in the database, so every device shows the same thing.

- `state.status` is `idle`, `running`, `paused` or `awaiting` (a phase ended and the next one waits for a tap). `state.phase` is `focus`, `short_break` or `long_break`.
- While `running`, the countdown is `phase_ends_at − now`. Correct for clock skew with `server_time` from the same response. While `paused`, show `paused_remaining_ms`.
- Change the timer only with `POST /focus/actions`. `action` is `start`, `pause`, `resume`, `skip`, `end` or `advance` (accepted only once the phase has actually ended). Send the `state.version` you acted on as `expectedVersion`. If another device got there first you receive `409` with `ok: false`, `error: "version_conflict"` and the current `state`; adopt it.
- `blocking.active` is true during a focus phase, running or paused, and false during breaks. `blocking.patterns` are the domains of the active block lists; each covers its subdomains.

```bash
curl -s $APP/api/v1/focus/state -H "Authorization: Bearer $TOKEN"
curl -s -X POST $APP/api/v1/focus/actions -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"action":"start","expectedVersion":12}'
```

For live updates, subscribe to Supabase Realtime on `sp_focus_state` instead of polling (see [IOS_INTEGRATION.md](./IOS_INTEGRATION.md)).

### Universe, quotes, push, data

| Method       | Path                  | Notes                                                   |
| ------------ | --------------------- | ------------------------------------------------------- |
| GET          | `/universe/snapshot`  | Stars, planets and constellations to draw               |
| GET          | `/quotes/random`      |                                                         |
| GET, POST    | `/quotes`             | Built-in quotes plus your own                           |
| DELETE       | `/quotes?id=`         | Your own quotes only                                    |
| POST, DELETE | `/push/subscriptions` | Web Push subscriptions                                  |
| GET          | `/export`             | Everything, as one JSON document                        |
| POST         | `/import`             | Merges an export by id; importing twice changes nothing |

## CORS

Browser requests are accepted from the app's own origin and from browser-extension origins (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`). `GET /instance` and `/openapi.json` are open to any origin. Native apps and scripts are not subject to CORS.
