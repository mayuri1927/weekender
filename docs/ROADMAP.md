# Weekender — Phase Roadmap

*Reflects completed work and planned phases as derived from the existing repository.*

---

## Phase 1 — Foundation (COMPLETED)

**Authentication + Basic User Onboarding**

### Implemented
- Firebase phone-number OTP authentication
- User record creation on first login (`users` table)
- Phone number stored as SHA-256 hash (dedup) and AES-256-CBC ciphertext (backend lookup only)
- Age gate: minimum 18 years enforced on date-of-birth submission
- User profile model (`user_profiles` table) with `isComplete` server-computed flag
- Device token registration for FCM (push notifications preparation)
- Logout (single-device and all-device)
- Global Firebase JWT guard with `@Public()` opt-out
- Helmet, CORS, ThrottlerModule, global ValidationPipe
- `GET /auth/health`, `POST /auth/otp/verify`, `POST /auth/logout`
- `GET /users/me`, `PATCH /users/me`, `POST /users/me/photo`, `POST /users/me/device-token`
- Swagger/OpenAPI at `/api/docs` (non-production)

### Migrations
- `20260901000000_init`
- `20260902000000_make_profile_name_gender_optional`

---

## Phase 2 — Profiles, Interests, Activities, Discovery (COMPLETED)

**Profiles + Interests + Cities/Areas + Activities + Discovery**

### Implemented
- City and area reference data (`cities`, `areas` tables)
- Interest categories and interests (`interest_categories`, `interests`, `user_interests` tables)
- User interest selection (`PUT /interests/me`)
- Profile completion: `name + dateOfBirth + gender + cityId` all required for `isComplete = true`
- City/area selection in profile
- Activity creation, update (host only), cancellation (host only), soft delete
- Activity discovery: `GET /activities` (paginated, filterable by city/area/category/date)
- Activity detail: `GET /activities/:id` (PUBLIC only; PRIVATE → 404)
- S3 pre-signed URL generation for profile photos and activity cover images
- `ActivityType` enum (`OPEN`, `REQUEST`) added to schema — behavior of REQUEST deferred to Phase 4
- Activity status lifecycle: `OPEN`, `FULL`, `CANCELLED`, `COMPLETED`, `DRAFT`
- Phase 2 security fixes: endTime PATCH validation, PRIVATE activity disclosure

### Migrations
- `20260902100000_phase2_geography_interests_activities`

### Known issues (carried forward)
- TDB-001: Hand-rolled AWS Sig V4 in StorageService; replace with `@aws-sdk/s3-request-presigner` before production

---

## Phase 3 — Participants, Join/Leave, Capacity (COMPLETED)

**Participant lifecycle + join/leave + host management + capacity enforcement**

### Implemented
- `ActivityParticipant` model with `ParticipantStatus` enum (`JOINED`, `LEFT`, `REMOVED`)
- `POST /activities/:id/join` — immediate join for OPEN activities (profile complete, not full, not cancelled/completed)
- `DELETE /activities/:id/join` — leave activity (JOINED → LEFT, reopens FULL activity)
- `GET /activities/:id/participants` — list JOINED participants (JWT required; PRIVATE → 404)
- `DELETE /activities/:id/participants/:participantId` — host removes a participant (JOINED → REMOVED)
- Re-join after leaving (LEFT → JOINED via upsert)
- Atomic activity status transitions: OPEN → FULL on last slot, FULL → OPEN on leave/removal
- `SELECT FOR UPDATE` row-level locking for concurrent join safety
- IDOR protections on all participant operations
- Flutter join/leave UI on activity detail screen (participant list, capacity display)
- Admin activity detail page with participant table
- 38 new unit tests; 182/182 total passing
- Real PostgreSQL integration test for concurrency (`test/integration/participants.concurrency.spec.ts`)
- TDB-004 RESOLVED: real PostgreSQL concurrency test added

### Migrations
- `20260904000000_phase3_participants`

### Known issues (remaining)
- TDB-001: AWS Sig V4 (carried from Phase 2)
- TDB-002: `minParticipants` is display-only; not enforced as a join gate or cancellation trigger
- TDB-003: `ActivityType.REQUEST` join behavior deferred → **resolved in Phase 4**

---

## Phase 4 — REQUEST Approval, Matching Foundation, Group Eligibility (COMPLETED)

**Host approval flow + deterministic matching + group eligibility foundation**

### Goals
- REQUEST-type activities: `POST /activities/:id/join` creates PENDING record instead of JOINED
- Host approve/reject endpoints: `POST /activities/:id/participants/:participantId/approve|reject`
- PENDING and REJECTED states added to `ParticipantStatus` enum and DB schema
- Capacity rule: only JOINED counts; PENDING does not consume a slot
- REJECTED is terminal (cannot re-request in V1)
- Concurrent approval safety: same `SELECT FOR UPDATE` pattern as Phase 3
- Participant list update: host can see PENDING and REJECTED; other users see JOINED only
- Matching API: `GET /activities/:id/match` — deterministic score using user/activity interests
- Group eligibility API: `GET /activities/:id/group-eligibility` — host + JOINED = eligible
- Flutter UI: REQUEST activity shows "Request to Join" button; pending state display; host approval UI
- Admin UI: pending requests visible
- Real PostgreSQL concurrency test for concurrent approvals

### Out of scope for Phase 4
See `docs/PRD.md` Section 10.

---

---

## Phase 5 — Group Chat (IMPLEMENTED — AWAITING QA)

**Stream Chat integration (server-side channel membership only)**

### Implemented
- `stream-chat` 8.61.0 server SDK integrated (Node 20 compatible)
- `ChatModule` / `ChatService` / `ChatController` — new NestJS module
- `STREAM_API_KEY` + `STREAM_API_SECRET` env vars (added to `.env.example`)
- Channel creation on activity create: `POST /activities` → Stream channel `weekender-activity-{id}`; host added as member
- Channel freeze on activity cancel: preserves history but blocks new messages
- Member add: OPEN join → JOINED, host approve → PENDING→JOINED → `addMember`
- Member remove: leave → LEFT, host remove → REMOVED → `removeMember`
- PENDING/REJECTED users are NEVER added to the channel (no Stream call on these paths)
- `GET /activities/:activityId/chat/token` — requires JWT; independently validates `groupEligible` server-side; returns token + channelId + channelType + apiKey
  - 401 if unauthenticated
  - 403 if not eligible (PENDING, REJECTED, LEFT, REMOVED, non-participant)
  - 404 if activity not found or PRIVATE
- `stream_chat_flutter` 10.4.0 added to Flutter (Dart ^3.12.0 ✓, Flutter ≥3.44.0 ✓)
- `ChatScreen` Flutter widget — connects using backend-issued token; NEVER calls Stream admin APIs
- `chatTokenProvider` Riverpod FutureProvider.family
- "Open Chat" button on activity detail screen (shown only when `groupEligible = true`)
- `/activities/:id/chat` GoRouter route
- All Stream calls are best-effort (TDB-006); DB transactions commit independently of Stream failures
- 24 new unit tests; 241/241 total passing

### Migrations
- None — channel ID derived from activity ID; no new DB column required

### Known limitations
- TDB-006: Stream Chat membership may drift from DB state if Stream API calls fail; no reconciliation mechanism in V1
- No integration test against real Stream Chat (external SaaS; requires real API credentials)

## Future Phases (Not Planned Yet)

The following are explicitly deferred and require separate requirements, design, and QA approval before implementation:

### Phase 6 — Notifications
- Firebase Cloud Messaging push notifications
- Notification preferences (model exists from Phase 1)
- Events: join approved, activity reminder, host actions

### Phase 7 — Advanced Matching
- Multi-factor compatibility scoring
- Recommended activity feed
- Social graph signals

### Phase 8 — Payments / Subscriptions
- Razorpay integration (webhook-only payment confirmation; client-side confirmation never trusted)
- Paid activities, subscription tiers

### Phase 9 — Audio/Video
- Agora RTC integration (short-lived tokens, server-issued, verified group members only)

### Phase 10 — KYC Enforcement
- KYC gate for restricted activity types
- Aadhaar/PAN verification via third-party provider (reference IDs only stored)

### Phase 11 — Location Features
- Exact activity location revealed only to approved participants after host finalisation

### Phase 12 — Infrastructure / Production
- AWS IaC (Terraform/CDK)
- Container orchestration (if approved)
- CI/CD pipeline
- Production monitoring and alerting

---

## Quality Gates

Each phase requires an explicit QA approval before the next phase begins. The QA gate includes:

1. All unit tests passing (zero regressions)
2. TypeScript compilation: 0 errors
3. Prisma schema validation: PASS
4. Mobile: `flutter analyze` — no issues
5. Admin: `npm run build` — PASS
6. Real PostgreSQL integration tests passing (Phase 3+)
7. Phase closure report published with final verdict
8. No unresolved Critical or High issues

**Phase 4 must not begin until this roadmap and the supporting docs (PRD, ARCHITECTURE, SECURITY) have been reviewed and approved.**
