# Demo accounts (LOCAL DEVELOPMENT ONLY)

These accounts are created by `npm run db:seed` (idempotent) and exist only for local development and automated tests.
**Never enable `SEED_DEMO_DATA` on a public/production database and never publish these credentials.**

## Passwords

Passwords are **not committed**. `node infrastructure/docker/gen-env.cjs` writes random values into your local, git-ignored `.env`:

| Account group | Password variable in `.env` |
|---|---|
| Platform admin | `SEED_PLATFORM_ADMIN_PASSWORD` |
| Every `@demo.hostel.test` account | `DEMO_PASSWORD` |

## Accounts

| Role | Email | Status | What it demonstrates |
|---|---|---|---|
| PLATFORM_ADMIN | `platform.admin@example.test` | active | Approve hostels, platform analytics, PDF |
| HOSTEL_ADMIN | `admin.sunrise@demo.hostel.test` | active | Sunrise Boys Hostel (Pune), 40 issues, approvals queue |
| HOSTEL_ADMIN | `admin.greenvalley@demo.hostel.test` | active | Green Valley Student Residence (Bengaluru) |
| HOSTEL_ADMIN | `admin.royalheights@demo.hostel.test` | active | Royal Heights Hostel (Hyderabad) |
| ASSISTANT | `assistant1.sunrise@demo.hostel.test` | approved | Assigned issues, status updates, resolution proof (also `assistant2`, `assistant3`) |
| STUDENT | `student1.sunrise@demo.hostel.test` | approved | Own issues, create issue (students `student1`..`student12` approved in Sunrise) |

Equivalent accounts exist per hostel: `assistantN.<slug>@demo.hostel.test`, `studentN.<slug>@demo.hostel.test`, with slugs `sunrise`, `greenvalley`, `royalheights`.

### Accounts for authorization testing (cannot access protected features)

| Email | Status | Expected result |
|---|---|---|
| `admin.campusnest@demo.hostel.test` | hostel **PENDING** | Login -> "Awaiting approval" screen. Approve it as the platform admin to activate. |
| `admin.urbanstay@demo.hostel.test` | hostel **REJECTED** | Login -> "Registration rejected" |
| `assistant5.sunrise@demo.hostel.test` | assistant **PENDING** | Login blocked until the hostel admin approves |
| `assistant4.sunrise@demo.hostel.test` | assistant **REJECTED** | Login blocked |
| `student13.sunrise@demo.hostel.test`, `student14.sunrise@demo.hostel.test` | **PENDING** | Login blocked until approved |
| `student15.sunrise@demo.hostel.test` | **REJECTED** | Login blocked |

## Seed contents

5 hostels (3 approved, 1 pending, 1 rejected), 54 users, 30 rooms, 120 issues (30% yet to start / 30% in progress / 40% done),
status history, resolution evidence, approval requests and audit logs. Generation is deterministic (fixed PRNG seed and stable IDs).
Media uses public HTTPS demo URLs (`picsum.photos`, MDN/W3Schools sample videos); no Cloudinary uploads are made, and automated tests never depend on those URLs loading.
