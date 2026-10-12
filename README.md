# HostelHub — Multi-tenant Hostel Management SaaS

Modular-monolith SaaS for hostels: registration and approval workflows, issue reporting/assignment/resolution with proof,
role dashboards, analytics and PDF reports. Four roles (Platform Admin, Hostel Admin, Assistant, Student) with strict RBAC and tenant isolation.

```
Browser -> React (Vite / Vercel) -> Nginx (public) -> Express (internal) -> PostgreSQL / Redis / (Cloudinary in prod)
```

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, TypeScript (strict), Tailwind CSS 3, Radix Dialog, React Router, TanStack Query, React Hook Form + Zod, Recharts, jsPDF + html2canvas |
| Backend | Node 22, Express 4, TypeScript (strict), Prisma 6, PostgreSQL 16, Redis 7 (ioredis), JWT + bcrypt, Zod, Pino, Helmet, CORS |
| Infra | Docker, Docker Compose, Nginx |
| Tests | Vitest, React Testing Library, Supertest, Playwright |

## Local setup

Prerequisites: Node 22+, Docker Desktop.

```bash
npm install
node infrastructure/docker/gen-env.cjs        # writes a git-ignored .env with random secrets and demo passwords
cp .env backend/.env                           # prisma CLI reads backend/.env
docker compose up -d --build                   # postgres, redis, backend (migrates + seeds), nginx on :8080
npm run dev:frontend                           # http://localhost:5173  (Vite proxies /api -> Nginx :8080)
```

* App: http://localhost:5173 · API through Nginx: http://localhost:8080/api/health
* Demo logins: see [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md) (passwords are in your local `.env`).
* The backend container is **not** published to the host; every API call goes through Nginx.
* Postgres is published on `127.0.0.1:5433` and Redis on `127.0.0.1:6380` for host tools and tests.

### Useful commands

| Command | Purpose |
|---|---|
| `npm run lint` / `npm run typecheck` | ESLint / `tsc` for backend and frontend |
| `npm run test:unit` | Backend unit tests + frontend component tests |
| `npm run test:integration` | Supertest API/DB/security tests against the disposable `hostel_test` database (+ Redis db 1) |
| `npm run test:e2e` | Playwright against the running local stack (needs `docker compose up -d`) |
| `npm run test:all` | unit + integration + e2e |
| `npm run build` | Production builds (backend `tsc`, frontend `vite build`) |
| `npm run db:migrate` / `npm run db:seed` | Apply migrations / idempotent seed |

For E2E runs set `RATE_LIMIT_LOGIN_MAX=60` and `RATE_LIMIT_REGISTER_MAX=60` in `.env` and `docker compose up -d backend`
(the default of 5 logins/minute/IP is intentionally strict; the limiter itself is covered by integration tests and an Nginx-level E2E test).

## Architecture notes

* **Modular monolith**: `backend/src/modules/{auth,hostels,users,approvals,rooms,issues,media,analytics,audit}`; services hold business logic, routes only validate and delegate.
* **Multi-tenancy**: a hostel is the tenant. The tenant is derived from the authenticated user's membership in the database on **every request** (never from client input); every query filters by `hostelId`, and out-of-scope IDs return `404`, not `403`.
* **Auth**: 15-minute JWT access tokens (in memory only) + rotating opaque refresh tokens (HMAC-hashed in PostgreSQL, HttpOnly cookie scoped to `/api/auth`). Reuse of a rotated token revokes the whole token family. Refresh/logout require a custom header and an allow-listed `Origin` (CSRF). Pending/rejected accounts cannot log in and existing tokens stop working immediately when their status changes.
* **Approvals**: `approval_requests` + compare-and-set `PENDING -> decision` inside a transaction (safe under concurrent decisions) with audit records. Platform admin decides hostels; hostel admin decides own assistants/students.
* **Issues**: `YET_TO_START -> IN_PROGRESS -> DONE` only; completion needs notes and ≥ 1 resolution attachment; optimistic-lock `version` column plus status compare-and-set prevent lost updates; full status history and audit trail.
* **Media**: `MEDIA_PROVIDER=external` (HTTPS URL validation, no server-side fetching, no private/IP hosts) or `cloudinary` (server-signed uploads bound to `hostel-<id>/issues/<issueId>/`, size/format checks, secrets never leave the server).
* **Redis**: dashboard/analytics cache with per-tenant version keys (invalidated on every issue/approval write) and sliding fixed-window rate limiting. If Redis is down, auth endpoints fall back to a strict in-process limiter (fail-closed on abuse), while the general API limiter and the cache fail open so the app stays available.
* **Rate limits** (configurable via env): login 5/min per IP and per identifier, registration 5/10 min per IP, API 100/min per user. Express trusts exactly one proxy hop; Nginx overwrites `X-Forwarded-For`, so spoofed headers are ignored.
* **Database**: composite indexes for `(hostel_id, status, created_at)`, `(hostel_id, assignee_id)`, `(hostel_id, created_at)`, approval queues, etc.; analytics use SQL aggregation with bound parameters; sort fields are allow-listed.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) (Vercel + Render Docker + Neon + Upstash + Cloudinary). No CI/CD is configured: **run `npm run test:all` locally before pushing to `main`**, because Vercel/Render redeploy on push without test gating.

## Documents

* [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md) · [DEPLOYMENT.md](DEPLOYMENT.md) · [TEST_REPORT.md](TEST_REPORT.md) · [.env.example](.env.example)
