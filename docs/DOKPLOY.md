# Deploying on Dokploy

Stellar Planner deploys on [Dokploy](https://dokploy.com) as a single Application built from this repository's `Dockerfile`. It needs no environment variables; the one thing you must add is a volume for `/data`.

## 1. Create the application

1. In your Dokploy project choose **Create Service → Application** and name it, for example `stellar-planner`.
2. Under **General → Provider**, connect the Git repository (GitHub, GitLab, Gitea, or a plain Git URL) and pick the branch to deploy.
3. Under **Build Type** select **Dockerfile**, with:
   - Dockerfile path: `Dockerfile`
   - Docker context path: `.`

   The image builds the browser-extension packages and the web app in one go. Allow a few minutes and about 2 GB of memory for the first build.

## 2. Mount `/data`

Open **Advanced → Volumes** and add a mount:

| Field       | Value                  |
| ----------- | ---------------------- |
| Type        | Volume Mount           |
| Volume name | `stellar-planner-data` |
| Mount path  | `/data`                |

This volume holds the encrypted configuration, the generated encryption key and the PIN lockout counters. **Without it every redeploy returns you to the setup wizard.** The container runs as a non-root user (uid 1000); a named volume gets the right ownership automatically. If you use a bind mount to a host folder instead, run `chown 1000:1000` on that folder.

## 3. Add the domain

Open **Domains → Add Domain**:

| Field          | Value                 |
| -------------- | --------------------- |
| Host           | `planner.example.com` |
| Path           | `/`                   |
| Container port | `3000`                |
| HTTPS          | on                    |
| Certificate    | Let's Encrypt         |

Point the domain's DNS record at the server first so the certificate can be issued. HTTPS is required for installing the PWA, for push notifications and for the service worker. Dokploy's Traefik forwards the `X-Forwarded-*` headers the app uses to learn its public address.

## 4. Deploy and set up

Press **Deploy**. When the build finishes, open the domain and follow the setup wizard: Supabase URL and keys, database migrations, your PIN. [SELF_HOSTING.md](./SELF_HOSTING.md) describes each step, including the recommendation to disable sign-ups on your Supabase (`GOTRUE_DISABLE_SIGNUP=true`).

If your Supabase also runs on Dokploy, use its public HTTPS URL in the wizard. Browsers and the extension connect to Supabase directly, so an internal Docker hostname would not work for them.

The image declares a health check on `/api/health`, which Dokploy shows as the container's health. It answers as soon as the server is up, before and after setup.

## 5. Optional environment variables

Nothing is required. Under **Environment** you may add any of these; they take precedence over what the wizard saved:

```
APP_SECRET=<32+ random characters, e.g. from: openssl rand -base64 48>
PUBLIC_APP_URL=https://planner.example.com
SUPABASE_URL=https://supabase.example.com
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres
```

Setting `APP_SECRET` here is the more secure arrangement: the key that encrypts `/data/config.json` then lives in Dokploy rather than beside the file. Set it **before** running the wizard and do not change it afterwards. Redeploy after changing environment variables.

**Forgotten PIN:** add `RESET_PIN=true`, redeploy, create a new PIN in the app, then remove the variable and redeploy once more.

## 6. Updating

- **Manually:** press **Deploy** (or **Rebuild**) to build the latest commit.
- **Automatically:** enable **Auto Deploy** under General and add the webhook URL from the **Deployments** tab to your Git provider, so each push to the branch redeploys.

After an update the app migrates its database by itself on start (over the connection string, or through your Supabase's pg-meta endpoint); there is no SQL to run. The container log shows what was applied. Dokploy keeps the previous image, so **Rollback** in the Deployments tab returns to the last version; migrations only ever add, so an older version keeps working against a newer schema.

## 7. Backups

Back up both:

1. **Your Supabase database.** All planner data is in the `sp_` tables of the `public` schema. If Supabase's Postgres is a Dokploy database service, use its **Backups** tab with an S3 destination and a schedule; otherwise use `pg_dump` as shown in [SELF_HOSTING.md](./SELF_HOSTING.md#backups).
2. **The `/data` volume**, plus `APP_SECRET` if you set it. Use Dokploy's **Volume Backups** for `stellar-planner-data` to S3, or from the server:

   ```bash
   docker run --rm -v stellar-planner-data:/data -v "$PWD":/backup busybox \
     tar czf /backup/stellar-planner-data.tgz -C /data .
   ```

Losing `/data` alone loses no planner data: run the wizard again against the same Supabase and choose a new PIN.
