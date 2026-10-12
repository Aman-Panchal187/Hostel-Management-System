# Test execution report

All results below were produced by commands run on the development machine (Windows 11, Node 22.14, Docker Desktop 29.2, Postgres 16, Redis 7). Nothing was run against Vercel, Render, Neon, Upstash or Cloudinary.

| Suite | Command | Result |
|---|---|---|
| Lint (ESLint, backend + frontend) | `npm run lint` | clean |
| Typecheck (strict) | `npm run typecheck` | clean |
| Backend unit | `npm run test:unit -w backend` | **59 passed / 0 failed** (3 files) |
| Frontend component (RTL) | `npm run test:unit -w frontend` | **24 passed / 0 failed** (2 files) |
| API + DB + security integration (Supertest, disposable `hostel_test` DB, Redis db 1) | `npm run test:integration` | **87 passed / 0 failed** (7 files) |
| End-to-end (Playwright, real stack: Vite -> Nginx -> Express -> Postgres/Redis) | `npm run test:e2e` | **18 passed / 0 failed** |
| Production build | `npm run build` | backend `tsc` + frontend `vite build` succeed |
| Production Docker image | built and run locally | healthy; Nginx on `$PORT`, Express on loopback; container exits when a process dies |

## What the suites cover

* **Unit**: password hashing, JWT (expired, wrong secret, `alg=none`, garbage), refresh-token hashing, Zod validation, status transitions, completion-evidence rules, approval authorization rules, analytics math, cache-key generation, media-provider selection, external URL validation (HTTP, localhost, IPs incl. decimal form, metadata IP, IPv6, credentials), Cloudinary provider (signing, folder binding, size/format) with no network calls.
* **Integration** (`backend/tests/integration`): registration, login, pending/rejected blocking, refresh rotation + reuse detection + concurrent refresh + logout + CSRF, hostel/assistant/student approvals (concurrent duplicate decisions: exactly one winner), full issue lifecycle, assignment/reassignment/audit, invalid transitions, lost-update protection, pagination/filter/sort, SQL-injection payloads, unsafe media URLs, analytics KPIs vs. known fixtures, Redis caching and invalidation, tenant-scoped cache, rate limiting (429, per-identifier, spoofed `X-Forwarded-For`), FK/unique/cascade/rollback behaviour, index presence.
* **Security cases from the spec (all executed)**: student/assistant/hostel-admin IDOR (1-3), cross-hostel approval (4), pending/rejected access (5, 6), student assigning (7), assistant approving (8), unauthorized status change (9), invalid transitions (10), SQL injection (11), missing/invalid JWT (12), expired JWT (13), refresh reuse (14), invalid media URLs (15), HTTP 429 (16), tenant-id manipulation (17), cross-tenant attachment changes (18).
* **E2E scenarios 1-6** (hostel onboarding, student onboarding, assistant onboarding, issue lifecycle incl. history + dashboard vs. API numbers, cross-tenant isolation, analytics filters + PDF download with `%PDF-` header and size check) plus Nginx routing/headers/body-limit/direct-access checks, Redis cache keys + TTL, and seed-data verification via `psql`.
* **Visual**: Playwright screenshots at 1440x900 and 390x844 for login, both registration pages and all four dashboards, with a horizontal-overflow assertion; screenshots inspected manually. The exported PDF was rendered to PNG and inspected.

## Defects found by testing and fixed

1. Analytics SQL cast `::uuid` against `text` columns (500) -> removed casts.
2. Concurrent transactions failed with Prisma "Unable to start a transaction" under contention -> `transactionOptions` (`maxWait` 10 s / `timeout` 15 s).
3. Refresh limiter (30/min/IP) logged users out on rapid reloads -> uses the general API limit.
4. PDF capture clipped card headings because of `backdrop-filter` and mid-flight chart animation -> chart animations disabled; solid `pdf-mode` styles during export; charts exported as whole blocks.

## Known limitations

See "Known issues" in the final report (Cloudinary upload UI, `npm audit` finding in Prisma CLI tooling, E2E rate-limit settings).
