# Phase 4 — QA Checklist

*Weekender backend Phase 4: REQUEST approval, matching foundation, group eligibility*

---

## 1. Unit Tests

| Area | Tests | Status |
|---|---|---|
| `join()` — OPEN activity (Phase 3, regression) | 14 tests | PASS |
| `join()` — REQUEST activity (PENDING creation) | 7 tests | PASS |
| `approveParticipant()` | 8 tests | PASS |
| `rejectParticipant()` | 5 tests | PASS |
| `listParticipants()` — host vs non-host visibility | 4 tests | PASS |
| `getMatch()` — all score paths | 5 tests | PASS |
| `getGroupEligibility()` — all statuses | 6 tests | PASS |
| Leave, removeParticipant, security (Phase 3 regression) | **carried** | PASS |
| **Total** | **217 tests** | **PASS** |

---

## 2. TypeScript / Build

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run build` (NestJS) | PASS |
| `npx prisma validate` | PASS |

---

## 3. Flutter

| Check | Result |
|---|---|
| `flutter analyze` | No issues |
| `flutter test` (11 tests) | PASS |

---

## 4. Admin

| Check | Result |
|---|---|
| `npm run build` (Next.js) | PASS |

---

## 5. Phase 4 Behaviour Checklist

### 5.1 REQUEST join → PENDING

- [x] `POST /activities/:id/join` on REQUEST activity creates `PENDING` record
- [x] PENDING does NOT consume a capacity slot
- [x] PENDING allowed even when activity is `FULL`
- [x] Duplicate PENDING request → `409 ConflictException`
- [x] JOINED user re-requesting → `409 ConflictException`
- [x] REMOVED user requesting → `403 ForbiddenException`
- [x] REJECTED user requesting → `403 ForbiddenException` (terminal in V1)
- [x] LEFT user re-requesting → `LEFT → PENDING` transition (re-request flow)

### 5.2 Host approval → JOINED

- [x] `POST /activities/:id/participants/:pid/approve` → `PENDING → JOINED`
- [x] Capacity re-checked atomically with `SELECT FOR UPDATE`
- [x] Approval at capacity → `409 ConflictException`
- [x] Approval transitions activity to `FULL` when last slot taken
- [x] Non-host approval attempt → `403 ForbiddenException`
- [x] Approving participant from different activity → `404` (IDOR protection)
- [x] Approving non-PENDING participant → `400 BadRequestException`
- [x] Host self-approval → `400 BadRequestException`

### 5.3 Host rejection → REJECTED (terminal)

- [x] `POST /activities/:id/participants/:pid/reject` → `PENDING → REJECTED`
- [x] Non-host rejection → `403 ForbiddenException`
- [x] Rejecting non-PENDING → `400 BadRequestException`
- [x] Rejecting across activities → `404` (IDOR protection)
- [x] REJECTED status is terminal; re-request throws `403`

### 5.4 Participant list — role-aware

- [x] Host receives `JOINED + PENDING + REJECTED`
- [x] Non-host receives `JOINED` only
- [x] No phone fields in any participant response

### 5.5 Matching

- [x] `GET /activities/:id/match` returns `{ matchScore, commonInterests }`
- [x] Score = userMatching / totalInCategory, clamped [0, 1]
- [x] No matching InterestCategory → `matchScore: 0`
- [x] Score is not stored; calculated dynamically
- [x] FUN activities now resolve to the `Fun` InterestCategory (seed data added)

### 5.6 Group eligibility

- [x] `GET /activities/:id/group-eligibility` returns `{ groupEligible, participantStatus }`
- [x] Host → `groupEligible: true, participantStatus: null`
- [x] JOINED → `groupEligible: true, participantStatus: 'JOINED'`
- [x] PENDING → `groupEligible: false, participantStatus: 'PENDING'`
- [x] REJECTED → `groupEligible: false, participantStatus: 'REJECTED'`
- [x] No record → `groupEligible: false, participantStatus: null`

### 5.7 OPEN activity regression (Phase 3 behaviour unchanged)

- [x] `POST /activities/:id/join` on OPEN activity still creates `JOINED` immediately
- [x] Capacity enforcement unchanged
- [x] Leave / remove participant unchanged

### 5.8 Admin UI

- [x] Admin activity detail shows activity type (OPEN / REQUEST) badge
- [x] Admin participant table shows ALL statuses (JOINED, PENDING, REJECTED, LEFT, REMOVED)
- [x] PENDING table displayed only for REQUEST-type activities
- [x] Admin token forwarded via `X-Admin-Token` header to backend admin endpoint
- [x] Backend `GET /admin/activities/:id/participants` protected by `AdminGuard` (ADMIN_JWT_SECRET)

### 5.9 Authorization / IDOR

- [x] All user IDs resolved from JWT → DB lookup; never from request body
- [x] Host identity verified from `activity.hostId` in DB
- [x] Approve/reject participant validated against `participant.activityId === activityId`
- [x] Non-host cannot approve, reject, or remove
- [x] Host cannot approve/reject themselves

---

## 6. Integration Tests

| Test | Status |
|---|---|
| Phase 3: concurrent joins — one slot — exactly one winner | PASS (PostgreSQL 16.15) |
| Phase 3: duplicate join — unique constraint holds | PASS (PostgreSQL 16.15) |
| Phase 4: concurrent approvals — one slot — exactly one winner | PASS (PostgreSQL 16.15) |
| Phase 4: loser remains PENDING; activity → FULL | PASS (PostgreSQL 16.15) |

Run with: `npm run test:integration`  
Executed: 2026-09-07 — 2 suites, 11 tests, 2.138 s — **11/11 PASS**

---

## 7. Known Technical Debt

| ID | Severity | Description |
|---|---|---|
| TDB-001 | Low | Hand-rolled AWS Sig V4 in StorageService (carries from Phase 2) |
| TDB-002 | Low | `minParticipants` display-only; not enforced (carries from Phase 3) |
| TDB-005 | Low | PENDING request cancellation not supported in V1; user cannot withdraw a PENDING request via the API |

No Critical or High issues.

---

## 8. Phase 4 Readiness

All unit tests pass. TypeScript, Prisma, Flutter, and admin build checks pass. Integration tests require a live PostgreSQL database to run. No unresolved Critical/High issues.

**PENDING QA FINAL SIGN-OFF** — all checks including real PostgreSQL concurrency tests passed. Awaiting sign-off.
