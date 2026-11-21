# Self-hosting Stellar Planner

Stellar Planner is one container plus a Supabase instance you already run. This guide covers a plain Docker deployment; for Dokploy see [DOKPLOY.md](./DOKPLOY.md).

## What you need

- **Docker** on the machine that will run the app.
- **A Supabase instance**: self-hosted (the official Docker setup works as is) or a Supabase Cloud project. The app uses its Auth, REST (PostgREST) and Realtime services, and creates tables prefixed `sp_` in the `public` schema. It can share the project with other apps.
- From that Supabase: the **URL**, the **anon key**, the **service role key**, and ideally the **Postgres connection string**.
- **HTTPS** in front of the app for anything beyond `localhost`. Installing the PWA, push notifications and the service worker all require it.

## 1. Start the container

```bash
git clone <this repository> stellar-planner && cd stellar-planner
docker compose up -d --build
```

or without Compose:

```bash
docker build -t stellar-planner .
docker run -d --name stellar-planner --restart unless-stopped \
  -p 3000:3000 -v stellar-data:/data stellar-planner
```

No environment variables are required. The container listens on port 3000, runs as a non-root user, and reports health at `/api/health`.

**Mount `/data`.** It holds the encrypted configuration, the generated encryption key, and the PIN lockout counters. Without a volume, a redeploy would send you back to the setup wizard.

Put your reverse proxy (Caddy, Traefik, nginx) in front of port 3000 with HTTPS. It should pass `X-Forwarded-Proto` and `X-Forwarded-Host`, as these proxies do by default, and allow WebSocket upgrades for your Supabase domain (the app itself does not use WebSockets).

## 2. Run the setup wizard

Open the app. Until setup is finished every page leads to `/setup`.

1. **Connect Supabase.** Paste the URL and keys. The URL is tidied for you (`/rest/v1`, trailing slashes and a missing `https://` are handled) and each service is probed, with a hint if something is off.
2. **Database.** With a connection string, the migrations run automatically. Without one, the wizard tries your instance's pg-meta service; failing that, it shows the SQL to paste into the Supabase SQL editor and a Verify button.
3. **Create your PIN** (6 to 12 digits).
4. **About you** (optional): time zone, week start, and a birthdate for the life progress bar.

Behind the scenes the wizard creates one hidden Supabase user, `owner@stellar.local`, with a random password that is stored only in the encrypted config. Your PIN unlocks that user; nobody ever types its password.

### Recommended: turn off sign-ups

Stellar Planner needs exactly one user. On self-hosted Supabase set `GOTRUE_DISABLE_SIGNUP=true` (named `DISABLE_SIGNUP` in the official `.env`) and restart the auth service; on Supabase Cloud switch off "Allow new users to sign up" under Authentication → Sign In / Providers. Row-level security already keeps other users away from your rows, so this is hardening, not a requirement. The owner user is created through the admin API and is unaffected.

### Realtime

Live sync between devices uses Supabase Realtime. The migrations add the `sp_` tables to the `supabase_realtime` publication. If the sync indicator in the app stays on "Reconnecting", check that the Realtime service is running and that your proxy forwards WebSockets to it. Everything still works without it; devices then catch up when they are reopened.

## 3. Optional environment variables

Set these only if you want to. A value from the environment wins over the one saved by the wizard. See [`.env.example`](../.env.example).

| Variable                                                         | Purpose                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_SECRET`                                                     | Key that encrypts `/data/config.json`. If unset, one is generated into `/data/secret`. Setting it yourself (32+ random characters) is more secure, because the key then lives apart from the data. Do not change it later. |
| `PUBLIC_APP_URL`                                                 | The app's public address, if it is not detected correctly behind your proxy.                                                                                                                                               |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase connection, instead of entering it in the wizard.                                                                                                                                                                 |
| `DATABASE_URL`                                                   | Postgres connection string: lets the app run migrations itself and revoke single devices.                                                                                                                                  |
| `RESET_PIN`                                                      | Set to `true` to clear the PIN on the next start (see below).                                                                                                                                                              |

## Forgot your PIN

1. Set `RESET_PIN=true` on the container and restart it.
2. Open the app: it asks you to create a new PIN. Your data is untouched.
3. **Remove `RESET_PIN` and restart again.** While it is set, every restart clears the PIN.

Too many wrong PINs lock sign-in for 30 seconds, doubling up to an hour. The lock lifts by itself.

## Updating

```bash
git pull
docker compose up -d --build
```

After an update, open **Settings → Connection**. It shows the schema version and can re-run the migrations (automatic with `DATABASE_URL`, otherwise copy the SQL as during setup). Migrations are idempotent, so running them again is always safe. Open browser tabs offer a "New version available" refresh, and the extension packages under Settings → Extension are rebuilt with each image.

## Backups

Two things hold your state:

1. **The Supabase database**, where all your data lives. Back it up the way you back up Postgres, for example:

   ```bash
   pg_dump "$DATABASE_URL" --schema=public --table='sp_*' -Fc -f stellar-$(date +%F).dump
   ```

   A full-database backup also covers the `auth` schema with the owner user.

2. **The `/data` volume** (`config.json`, `secret`, `lockout.json`), plus `APP_SECRET` if you set it yourself.

   ```bash
   docker run --rm -v stellar-data:/data -v "$PWD":/backup busybox tar czf /backup/stellar-data.tgz -C /data .
   ```

If `/data` is lost but the database survives, nothing of yours is gone: run the wizard again against the same Supabase and choose a PIN. The wizard recognises the existing tables and reconnects the owner user.

**Settings → Data → Export** also downloads everything as one JSON file that can be imported into any Stellar Planner instance.

## Troubleshooting

| Symptom                                                          | Likely cause                                                                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Sent back to `/setup` after a redeploy                           | `/data` is not on a persistent volume                                                                            |
| The app reports that the saved configuration cannot be decrypted | `APP_SECRET` changed, or `/data/secret` was replaced. Restore it, or run setup again                             |
| "Install app" is missing, or no notifications                    | The app is not served over HTTPS. On iPhone, add it to the Home Screen first; notifications only work from there |
| Devices do not update each other                                 | Realtime is not reachable; see Realtime above                                                                    |
| Per-device "Revoke" is missing                                   | Needs `DATABASE_URL`; "Sign out everywhere" works without it                                                     |
| Extension cannot connect                                         | Use the app's public HTTPS address, the same one you open in a tab                                               |
