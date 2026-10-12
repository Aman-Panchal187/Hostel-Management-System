# Production deployment guide

Status: **prepared, not deployed.** Nothing below has been executed against Vercel, Render, Neon, Upstash or Cloudinary (no accounts/credentials were available). Local verification of the production Docker image is documented in TEST_REPORT.md.

Topology: `Vercel (React) -> Render public URL -> Nginx (PORT, default 10000) -> Express (127.0.0.1:3000) -> Neon / Upstash / Cloudinary`.

## 0. Before every push to `main`

Vercel and Render auto-deploy on push through their native GitHub integrations. There is **no** CI/CD pipeline and therefore no test gate:

```bash
npm run lint && npm run typecheck && npm run test:all && npm run build
```

## 1. Neon (PostgreSQL)

1. Create a project and **separate** databases/branches for production and (optionally) staging. Do not reuse the local `hostel_test` DB.
2. Use two connection strings:
   * **Pooled** (host contains `-pooler`) for the app: `DATABASE_URL=postgresql://USER:PASS@HOST-pooler/DB?sslmode=require&pgbouncer=true&connection_limit=5`
   * **Direct** (no `-pooler`) for migrations. Prisma `migrate deploy` needs a direct connection; run it from your machine or a one-off shell: `DATABASE_URL=<direct url> npm run db:migrate`.
3. Migrations only move forward (`prisma migrate deploy`). Never run `migrate dev`/`reset` or the demo seed against production.

The container entrypoint runs `prisma migrate deploy` on start (`RUN_MIGRATIONS=true`, default). With Neon, set `RUN_MIGRATIONS=false` and migrate with the direct URL, or provide the direct URL as `DATABASE_URL` only if you accept running the app without the pooler.

## 2. Upstash Redis

Create a database and copy the **TLS** URL: `REDIS_URL=rediss://default:<password>@<host>.upstash.io:6379`. ioredis enables TLS automatically for `rediss://`. Used for dashboard caching and rate limiting.

## 3. Cloudinary

Set `MEDIA_PROVIDER=cloudinary`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` on Render only (never in the frontend). `POST /api/issues/:id/media/signature` returns a server-signed `{timestamp, folder, signature}`; the browser uploads straight to Cloudinary with `auto` resource type, then registers the asset with `POST /api/issues/:id/attachments` `{url, mediaType, publicId, bytes, format}`. The server accepts only assets inside `hostel-<hostelId>/issues/<issueId>/` on its own cloud.
> The current UI uses the external-URL flow. Wiring a file-picker to the signature endpoint is the one frontend step still needed for Cloudinary mode (see Known issues).

## 4. Render (Docker web service)

* New **Web Service** -> your GitHub repo -> Runtime **Docker**
* Dockerfile path: `infrastructure/docker/production.Dockerfile`, Docker context: `.` (repo root)
* Health check path: `/api/health`
* Auto-deploy: on commit to `main`
* Environment variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon pooled URL |
| `REDIS_URL` | Upstash `rediss://…` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | two different 64-hex-char random secrets |
| `FRONTEND_URL` | exact Vercel origin, e.g. `https://hostelhub.vercel.app` (comma-separate preview/custom domains) |
| `TRUST_PROXY_HOPS` | `1` |
| `MEDIA_PROVIDER` + Cloudinary vars | see §3 |
| `RUN_MIGRATIONS` | `true` (or `false` if migrating manually) |
| `SEED_PLATFORM_ADMIN_EMAIL`, `SEED_PLATFORM_ADMIN_PASSWORD`, `RUN_SEED_ON_START=true` | creates **only** the platform admin on first boot (idempotent; never overwrites). Remove the password variable and set `RUN_SEED_ON_START=false` afterwards. |
| `SEED_DEMO_DATA` | leave **unset/false** in production (the seed refuses demo data in production unless explicitly `true`) |

Render injects `PORT`; Nginx listens on it (default 10000) and Express stays on loopback `3000`. If either process dies the container exits and Render restarts it.

**Free tier**: the service sleeps after inactivity; the first request after sleep can take ~30–60 s (cold start + migrations check). The frontend shows loading states and retries network failures twice.

Cookies: in production the refresh cookie is `Secure; HttpOnly; SameSite=None; Path=/api/auth` so it works cross-site (Vercel -> Render). CORS allows only `FRONTEND_URL` origins and sends credentials. Some browsers block third-party cookies; putting both apps under one registrable domain (custom domains such as `app.example.com` + `api.example.com`) with `COOKIE_SAMESITE=lax` is the robust long-term setup.

## 5. Vercel (frontend)

* Import the repo, **Root Directory** `frontend`
* Framework preset: Vite · Build command `npm run build` · Output directory `dist`
* Env var: `VITE_API_URL=https://<your-service>.onrender.com`
* SPA fallback and security headers are in `frontend/vercel.json`
* Production branch: `main` (auto-deploys)
* Note: Vercel **Hobby** is for personal, non-commercial use only; a commercial SaaS needs a Pro/Enterprise plan.

## 6. Post-deploy checks

```bash
curl https://<service>.onrender.com/api/health          # {"status":"ok","database":"up","redis":"up"}
curl -i -H "Origin: https://evil.example" https://<service>.onrender.com/api/health   # no Access-Control-Allow-Origin
```

Log in as the platform admin on the Vercel URL, register a hostel, approve it, and run through the issue flow. Do not publish demo credentials.
